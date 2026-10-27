/**
 * SG Car Buddy API — Cloudflare Worker (free plan).
 *
 *  GET /v1/health
 *  GET /v1/carparks/catalog           merged HDB + URA + LTA carpark list (daily)
 *  GET /v1/carparks/availability      free lots for every carpark (1 min)
 *  GET /v1/ev                         LTA EVCBatch file, passed through unparsed (5 min)
 *  GET /v1/roads/cameras              the LTA traffic cameras with fresh image links (1 min)
 *  GET /v1/roads                      incidents, faulty lights, travel times, PUB flood alerts (2 min)
 *  GET /v1/weather                    NEA rain, 2-hour forecast, temperature, 4-day outlook (fallback; the app reads NEA directly)
 *  GET /v1/weather/radar              last hour of NEA 70 km radar frames
 *  GET /v1/weather/radar/{ts}.png     one radar frame, proxied (NEA's own links expire and lack CORS)
 *  GET /v1/places?q=                  OneMap place / postal code search
 *
 * Keys live only in Worker secrets (LTA_ACCOUNT_KEY, DATAGOVSG_API_KEY, ONEMAP_*, URA_ACCESS_KEY). Never logged or returned.
 * Island-wide payloads only: the app never sends its location here.
 */
import type {
  ApiErrorBody,
  AvailabilityResponse,
  CamerasResponse,
  CarparkCatalogResponse,
  HealthResponse,
  PlacesResponse,
  RadarResponse,
  RoadsResponse,
  WeatherResponse,
} from '../../shared/contract';
import { buildCatalog, normaliseAvailability, type HdbAvailabilityPayload, type LtaCarparkRow, type UraDetailsRow } from '../../shared/carparks';
import {
  normaliseForecast,
  normaliseOutlook,
  normaliseStations,
  type DgsForecastPayload,
  type DgsOutlookPayload,
  type DgsStationPayload,
} from '../../shared/nea';
import { normalisePlaces, onemapSearchUrl, type OneMapSearchPayload } from '../../shared/onemap';
import {
  normaliseDgsCameras,
  normaliseFaultyLights,
  normaliseFloods,
  normaliseIncidents,
  normaliseLtaCameras,
  normaliseTravelTimes,
  type DgsTrafficImagesPayload,
  type LtaFaultyLightRow,
  type LtaFloodRow,
  type LtaImageRow,
  type LtaIncidentRow,
  type LtaTravelRow,
} from '../../shared/roads';

export interface Env {
  LTA_ACCOUNT_KEY?: string;
  DATAGOVSG_API_KEY?: string;
  ONEMAP_EMAIL?: string;
  ONEMAP_PASSWORD?: string;
  /** Optional URA Data Service AccessKey: exact URA carpark rates and capacity. */
  URA_ACCESS_KEY?: string;
  ALLOWED_ORIGINS?: string;
  RATE_LIMITER?: RateLimit;
}

const LTA_BASE = 'https://datamall2.mytransport.sg/ltaodataservice';
const DGS_REALTIME = 'https://api-open.data.gov.sg/v2/real-time/api';
const DGS_DATASETS = 'https://api-open.data.gov.sg/v1/public/api/datasets';
const DGS_V1 = 'https://api.data.gov.sg/v1';
const URA_BASE = 'https://eservice.ura.gov.sg/uraDataService';
const HDB_INFO_DATASET = 'd_23f946fa557947f93a8043bbef41dd09';
const UPSTREAM_TIMEOUT_MS = 10_000;
/**
 * When a last-good copy exists, wait at most this long for a refresh before answering with that copy.
 * The refresh carries on in the background (ctx.waitUntil), so a slow or unreachable source never makes the app wait.
 */
const SOFT_DEADLINE_MS = 2_500;
const LTA_PAGE = 500;
/** DataMall pages requested together (the carpark feed is ~5 pages); UPSTREAM_CONCURRENCY still applies. */
const LTA_PARALLEL = 3;
/**
 * At most this many upstream requests in flight at once (per isolate). Cloudflare allows 6 open connections per
 * request, and some networks drop every connection when too many open together (measured during development:
 * 6 at once fine, 8 at once → all cancelled after 5 s).
 */
const UPSTREAM_CONCURRENCY = 4;

/** Fresh TTL / last-good TTL, in seconds. */
const TTL = {
  catalog: [24 * 3600, 7 * 24 * 3600],
  availability: [60, 3600],
  ev: [240, 3600],
  cameras: [60, 900],
  roads: [120, 3600],
  weather: [300, 3 * 3600],
  radar: [240, 3600],
  places: [24 * 3600, 7 * 24 * 3600],
} as const;

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorBody['error']['code'],
    message: string,
  ) {
    super(message);
  }
}

/* ---------------- HTTP helpers ---------------- */

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim());
  const h: Record<string, string> = { Vary: 'Origin' };
  // CORS only limits browsers/WebViews; real abuse protection is the rate limiter.
  if (origin && (allowed.includes(origin) || allowed.includes('*'))) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    h['Access-Control-Expose-Headers'] = 'X-Fetched-At, X-Stale';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

function json(req: Request, env: Env, body: unknown, status = 200, maxAge = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge > 0 ? `public, max-age=${maxAge}` : 'no-store',
      ...corsHeaders(req, env),
    },
  });
}

function errorResponse(req: Request, env: Env, err: unknown): Response {
  if (err instanceof HttpError) {
    return json(req, env, { error: { code: err.code, message: err.message } } satisfies ApiErrorBody, err.status);
  }
  console.error('unhandled', err instanceof Error ? err.message : err);
  return json(req, env, { error: { code: 'internal', message: 'Something went wrong.' } } satisfies ApiErrorBody, 500);
}

const fresh = (e: { fetchedAt: string; stale: boolean }) => ({ serverTime: new Date().toISOString(), fetchedAt: e.fetchedAt, stale: e.stale });

/* ---------------- Two-layer cache with last-good fallback and request coalescing ---------------- */

interface Entry<T> {
  data: T;
  fetchedAt: string;
}

const memory = new Map<string, { entry: Entry<unknown>; freshUntil: number; goodUntil: number }>();
const inflight = new Map<string, Promise<Entry<unknown>>>();
const cacheUrl = (key: string) => `https://cache.sgcarbuddy.internal/v1/${encodeURIComponent(key)}`;
/** Cloudflare edge cache; absent under Node (scripts/dev-node.ts). */
const edgeCache = (): Cache | null => (typeof caches !== 'undefined' ? caches.default : null);

/** Resolves to the promise's value, or null if it rejects or takes longer than `ms`. */
async function within<T>(p: Promise<T>, ms: number): Promise<{ value: T } | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((r) => (timer = setTimeout(() => r(null), ms)));
  try {
    return await Promise.race([p.then((value) => ({ value })), timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fresh copy → served from memory / edge. Expired → refreshed from upstream; if that fails or is slow and a
 * last-good copy exists (memory or edge, up to `goodTtl`), the last-good copy is served marked `stale` while the
 * refresh finishes in the background. Concurrent refreshes of one key share a single upstream call.
 */
async function cached<T>(ctx: ExecutionContext, key: string, [freshTtl, goodTtl]: readonly [number, number], load: () => Promise<T>): Promise<Entry<T> & { stale: boolean }> {
  const now = Date.now();
  const mem = memory.get(key);
  if (mem && mem.freshUntil > now) return { ...(mem.entry as Entry<T>), stale: false };

  let fallback = mem && mem.goodUntil > now ? (mem.entry as Entry<T>) : null;
  const edge = (await edgeCache()?.match(cacheUrl(key)).catch(() => undefined)) ?? undefined;
  if (edge) {
    const entry = (await edge.json().catch(() => null)) as Entry<T> | null;
    if (entry && now - Date.parse(entry.fetchedAt) < freshTtl * 1000) {
      memory.set(key, { entry, freshUntil: Date.parse(entry.fetchedAt) + freshTtl * 1000, goodUntil: now + goodTtl * 1000 });
      return { ...entry, stale: false };
    }
    if (entry && (!fallback || entry.fetchedAt > fallback.fetchedAt)) fallback = entry;
  }

  let p = inflight.get(key) as Promise<Entry<T>> | undefined;
  if (!p) {
    p = load().then((data) => {
      const entry: Entry<T> = { data, fetchedAt: new Date().toISOString() };
      memory.set(key, { entry, freshUntil: Date.now() + freshTtl * 1000, goodUntil: Date.now() + goodTtl * 1000 });
      const cache = edgeCache();
      if (cache) ctx.waitUntil(cache.put(cacheUrl(key), new Response(JSON.stringify(entry), { headers: { 'Cache-Control': `public, max-age=${goodTtl}` } })).catch(() => {}));
      return entry;
    });
    inflight.set(key, p);
    p.finally(() => inflight.delete(key)).catch(() => {});
    // Let a slow refresh finish after we've answered, so the next request gets it.
    ctx.waitUntil(p.catch(() => {}));
  }
  if (!fallback) return { ...(await p), stale: false };
  const got = await within(p, SOFT_DEADLINE_MS);
  return got ? { ...got.value, stale: false } : { ...fallback, stale: true };
}

/** Same idea for raw bytes (EV batch file, radar PNGs): no JSON parsing, so almost no CPU. */
interface RawEntry {
  body: ArrayBuffer;
  type: string;
  fetchedAt: string;
}
const rawMemory = new Map<string, RawEntry & { freshUntil: number; goodUntil: number }>();
const rawInflight = new Map<string, Promise<RawEntry>>();

async function cachedRaw(
  ctx: ExecutionContext,
  key: string,
  [freshTtl, goodTtl]: readonly [number, number],
  load: () => Promise<{ body: ArrayBuffer; type: string }>,
): Promise<RawEntry & { stale: boolean }> {
  const now = Date.now();
  const mem = rawMemory.get(key);
  if (mem && mem.freshUntil > now) return { ...mem, stale: false };
  let fallback: RawEntry | null = mem && mem.goodUntil > now ? mem : null;
  const edge = (await edgeCache()?.match(cacheUrl(key)).catch(() => undefined)) ?? undefined;
  if (edge) {
    const edgeAt = edge.headers.get('X-Fetched-At') ?? '';
    const hit: RawEntry = { body: await edge.arrayBuffer(), type: edge.headers.get('Content-Type') ?? 'application/octet-stream', fetchedAt: edgeAt };
    if (now - Date.parse(edgeAt) < freshTtl * 1000) {
      rawMemory.set(key, { ...hit, freshUntil: Date.parse(edgeAt) + freshTtl * 1000, goodUntil: now + goodTtl * 1000 });
      return { ...hit, stale: false };
    }
    if (!fallback || edgeAt > fallback.fetchedAt) fallback = hit;
  }
  let p = rawInflight.get(key);
  if (!p) {
    p = load().then((r) => {
      const got: RawEntry = { ...r, fetchedAt: new Date().toISOString() };
      rawMemory.set(key, { ...got, freshUntil: Date.now() + freshTtl * 1000, goodUntil: Date.now() + goodTtl * 1000 });
      // Keep memory bounded (radar frames come and go).
      if (rawMemory.size > 40) rawMemory.delete(rawMemory.keys().next().value!);
      const cache = edgeCache();
      if (cache) {
        ctx.waitUntil(
          cache
            .put(cacheUrl(key), new Response(got.body.slice(0), { headers: { 'Content-Type': got.type, 'X-Fetched-At': got.fetchedAt, 'Cache-Control': `public, max-age=${goodTtl}` } }))
            .catch(() => {}),
        );
      }
      return got;
    });
    rawInflight.set(key, p);
    p.finally(() => rawInflight.delete(key)).catch(() => {});
    ctx.waitUntil(p.catch(() => {}));
  }
  if (!fallback) return { ...(await p), stale: false };
  const got = await within(p, SOFT_DEADLINE_MS);
  return got ? { ...got.value, stale: false } : { ...fallback, stale: true };
}

/* ---------------- Upstream fetchers ---------------- */

let upstreamActive = 0;
const upstreamQueue: Array<() => void> = [];

/** Runs `fn` when one of the UPSTREAM_CONCURRENCY slots is free (first come, first served). */
async function upstreamSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (upstreamActive < UPSTREAM_CONCURRENCY) upstreamActive++;
  else await new Promise<void>((r) => upstreamQueue.push(r)); // a finishing request hands its slot over
  try {
    return await fn();
  } finally {
    const next = upstreamQueue.shift();
    if (next) next();
    else upstreamActive--;
  }
}

const NULL_BODY = new Set([101, 204, 205, 304]);

/**
 * fetch() that turns network failures and timeouts into a clean 502 (never a 500).
 * Limited to UPSTREAM_CONCURRENCY at once; the body is read inside the slot so the connection is really done.
 * A connection error (not a timeout) is retried once: mobile networks drop the odd connection.
 */
async function upstream(url: string, init: RequestInit = {}, timeoutMs = UPSTREAM_TIMEOUT_MS): Promise<Response> {
  return upstreamSlot(async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
        const body = NULL_BODY.has(res.status) ? null : await res.arrayBuffer();
        return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
      } catch (e) {
        const name = e instanceof Error ? e.name : '';
        const timedOut = name === 'TimeoutError' || name === 'AbortError';
        if (attempt === 1 && !timedOut) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        const cause = (e as { cause?: { code?: unknown; message?: string } }).cause;
        const why = timedOut ? 'timeout' : cause ? [cause.code, cause.message].filter(Boolean).join(' ') : name;
        console.warn('upstream fetch failed', new URL(url).host, why);
        throw new HttpError(502, 'upstream_unavailable', 'A data source is not responding. Try again shortly.');
      }
    }
  });
}

async function lta<T>(env: Env, path: string): Promise<T> {
  if (!env.LTA_ACCOUNT_KEY) throw new HttpError(503, 'not_configured', 'LTA_ACCOUNT_KEY is not set on the server.');
  const res = await upstream(`${LTA_BASE}${path}`, { headers: { AccountKey: env.LTA_ACCOUNT_KEY, accept: 'application/json' } });
  if (res.status === 401 || res.status === 403) {
    console.error('LTA rejected the AccountKey', res.status, path.split('?')[0]);
    throw new HttpError(503, 'not_configured', 'LTA rejected the server credentials.');
  }
  if (!res.ok) {
    console.warn('LTA upstream error', res.status, path.split('?')[0]);
    throw new HttpError(502, 'upstream_unavailable', 'LTA DataMall is unavailable. Try again shortly.');
  }
  return (await res.json()) as T;
}

/** All pages of a DataMall dataset (500 rows per call), a few pages at a time. */
async function ltaAll<T>(env: Env, path: string, maxRows = 10_000): Promise<T[]> {
  const rows: T[] = [];
  const sep = path.includes('?') ? '&' : '?';
  for (let skip = 0; skip < maxRows; skip += LTA_PAGE * LTA_PARALLEL) {
    const skips = Array.from({ length: LTA_PARALLEL }, (_, i) => skip + i * LTA_PAGE).filter((n) => n < maxRows);
    const pages = await Promise.all(skips.map((n) => lta<{ value?: T[] }>(env, `${path}${sep}$skip=${n}`)));
    for (const page of pages) rows.push(...(page.value ?? []));
    if (pages.some((page) => (page.value?.length ?? 0) < LTA_PAGE)) break;
  }
  return rows;
}

function dgsHeaders(env: Env): Record<string, string> {
  const h: Record<string, string> = { accept: 'application/json' };
  if (env.DATAGOVSG_API_KEY) h['x-api-key'] = env.DATAGOVSG_API_KEY;
  return h;
}

async function dgs<T>(env: Env, url: string): Promise<T> {
  const res = await upstream(url, { headers: dgsHeaders(env) });
  if (!res.ok) throw new HttpError(502, 'upstream_unavailable', 'data.gov.sg is unavailable.');
  return (await res.json()) as T;
}

/** data.gov.sg dataset file: initiate-download, then poll-download until a signed URL is ready. */
async function dgsDatasetText(env: Env, datasetId: string): Promise<string> {
  await dgs(env, `${DGS_DATASETS}/${datasetId}/initiate-download`).catch(() => null);
  for (let i = 0; i < 4; i++) {
    const poll = await dgs<{ data?: { status?: string; url?: string } }>(env, `${DGS_DATASETS}/${datasetId}/poll-download`);
    if (poll.data?.url) {
      const res = await upstream(poll.data.url, {}, 20_000);
      if (!res.ok) break;
      return await res.text();
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new HttpError(502, 'upstream_unavailable', 'HDB carpark information is unavailable.');
}

/** OneMap tokens last 3 days; fetch one with the account credentials and reuse it. */
let onemapToken: { token: string; until: number } | null = null;
async function onemapAuth(env: Env): Promise<Record<string, string>> {
  if (!env.ONEMAP_EMAIL || !env.ONEMAP_PASSWORD) return {};
  if (!onemapToken || onemapToken.until < Date.now() + 3600_000) {
    const res = await fetch('https://www.onemap.gov.sg/api/auth/post/getToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: env.ONEMAP_EMAIL, password: env.ONEMAP_PASSWORD }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error('OneMap token request failed', res.status);
      return {};
    }
    const t = (await res.json()) as { access_token?: string; expiry_timestamp?: string };
    if (!t.access_token) return {};
    onemapToken = { token: t.access_token, until: Number(t.expiry_timestamp) * 1000 || Date.now() + 2 * 86400_000 };
  }
  return { Authorization: onemapToken.token };
}

/** URA Data Service: a token per day from the AccessKey, then Car_Park_Details. Optional. */
async function uraDetails(env: Env): Promise<UraDetailsRow[] | null> {
  if (!env.URA_ACCESS_KEY) return null;
  try {
    const t = await fetch(`${URA_BASE}/insertNewToken/v1`, { headers: { AccessKey: env.URA_ACCESS_KEY }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    const token = ((await t.json()) as { Result?: string }).Result;
    if (!token) return null;
    const r = await fetch(`${URA_BASE}/invokeUraDS/v1?service=Car_Park_Details`, {
      headers: { AccessKey: env.URA_ACCESS_KEY, Token: token },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const body = (await r.json()) as { Status?: string; Result?: UraDetailsRow[] };
    return body.Result ?? null;
  } catch (e) {
    console.warn('URA details failed', e instanceof Error ? e.message : e);
    return null;
  }
}

/* ---------------- Radar helpers ---------------- */

const RADAR_BBOX: [number, number, number, number] = [103.342685, 0.719515, 104.602315, 1.97854];
const RADAR_FRAMES = 12;

/** "2026-10-27T07:40:00+08:00" → "202610270740". */
const radarTs = (iso: string) => iso.slice(0, 16).replace(/[-T:]/g, '');
/** "202610270740" → "2026-10-27T07:40:00". */
const radarIsoLocal = (ts: string) => `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:00`;

interface DgsRadarPayload {
  data?: { boundaryBox?: unknown; records?: Array<{ timestamp?: string; image?: { url?: string } }> };
}

/* ---------------- Route handlers ---------------- */

async function handle(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');

  if (path === '/v1/health') {
    const body: HealthResponse = {
      ok: true,
      ltaConfigured: Boolean(env.LTA_ACCOUNT_KEY),
      dataGovConfigured: Boolean(env.DATAGOVSG_API_KEY),
      oneMapConfigured: Boolean(env.ONEMAP_EMAIL && env.ONEMAP_PASSWORD),
      uraConfigured: Boolean(env.URA_ACCESS_KEY),
    };
    return json(req, env, body);
  }

  if (path === '/v1/carparks/catalog') {
    const entry = await cached(ctx, 'carparks:catalog', TTL.catalog, async () => {
      const [csv, totals, rows, ura] = await Promise.allSettled([
        dgsDatasetText(env, HDB_INFO_DATASET),
        dgs<HdbAvailabilityPayload>(env, `${DGS_V1}/transport/carpark-availability`),
        ltaAll<LtaCarparkRow>(env, '/CarParkAvailabilityv2'),
        uraDetails(env),
      ]);
      const ok = <T>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : null);
      const built = buildCatalog({ hdbCsv: ok(csv), hdbAvailability: ok(totals), ltaRows: ok(rows), uraRows: ok(ura) });
      if (built.carparks.length < 1500) throw new HttpError(502, 'upstream_unavailable', 'Carpark list looked incomplete.');
      return {
        ...built,
        sources: { hdbInfo: csv.status === 'fulfilled', hdbTotals: totals.status === 'fulfilled', lta: rows.status === 'fulfilled', uraRates: Boolean(ok(ura)?.length) },
      };
    });
    const body: CarparkCatalogResponse = { ...entry.data, ...fresh(entry) };
    return json(req, env, body, 200, 3600);
  }

  if (path === '/v1/carparks/availability') {
    const entry = await cached(ctx, 'carparks:availability', TTL.availability, async () =>
      normaliseAvailability(await ltaAll<LtaCarparkRow>(env, '/CarParkAvailabilityv2')),
    );
    const body: AvailabilityResponse = { lots: entry.data, ...fresh(entry) };
    return json(req, env, body, 200, 30);
  }

  if (path === '/v1/ev') {
    const entry = await cachedRaw(ctx, 'ev:batch', TTL.ev, async () => {
      const meta = await lta<{ value?: Array<{ Link?: string }> }>(env, '/EVCBatch');
      const link = meta.value?.[0]?.Link;
      if (!link) throw new HttpError(502, 'upstream_unavailable', 'EV charger data is unavailable.');
      // The signed link expires within minutes: download it straight away.
      const res = await upstream(link, {}, 20_000);
      if (!res.ok) throw new HttpError(502, 'upstream_unavailable', 'EV charger data is unavailable.');
      return { body: await res.arrayBuffer(), type: 'application/json; charset=utf-8' };
    });
    return new Response(entry.body, {
      headers: {
        'Content-Type': entry.type,
        'Cache-Control': 'public, max-age=120',
        'X-Fetched-At': entry.fetchedAt,
        'X-Stale': String(entry.stale),
        ...corsHeaders(req, env),
      },
    });
  }

  if (path === '/v1/roads/cameras') {
    const entry = await cached(ctx, 'roads:cameras', TTL.cameras, async () => {
      if (env.LTA_ACCOUNT_KEY) {
        const rows = await lta<{ value?: LtaImageRow[] }>(env, '/Traffic-Imagesv2').catch(() => null);
        if (rows?.value?.length) return { cameras: normaliseLtaCameras(rows.value), source: 'lta' as const };
      }
      const p = await dgs<DgsTrafficImagesPayload>(env, `${DGS_V1}/transport/traffic-images`);
      return { cameras: normaliseDgsCameras(p), source: 'data.gov.sg' as const };
    });
    const body: CamerasResponse = { ...entry.data, ...fresh(entry) };
    return json(req, env, body, 200, 30);
  }

  if (path === '/v1/roads') {
    const entry = await cached(ctx, 'roads:status', TTL.roads, async () => {
      const [inc, lights, travel, floods] = await Promise.allSettled([
        lta<{ value?: LtaIncidentRow[] }>(env, '/TrafficIncidents'),
        lta<{ value?: LtaFaultyLightRow[] }>(env, '/v2/FaultyTrafficLights'),
        lta<{ value?: LtaTravelRow[] }>(env, '/EstTravelTimes'),
        lta<{ value?: LtaFloodRow[] }>(env, '/PubFloodAlerts'),
      ]);
      if ([inc, lights, travel, floods].every((r) => r.status === 'rejected')) {
        throw (inc as PromiseRejectedResult).reason ?? new HttpError(502, 'upstream_unavailable', 'LTA DataMall is unavailable.');
      }
      const now = new Date();
      const val = <T>(r: PromiseSettledResult<{ value?: T[] }>) => (r.status === 'fulfilled' ? (r.value.value ?? []) : []);
      const t = normaliseTravelTimes(val(travel));
      return {
        incidents: normaliseIncidents(val(inc), now),
        faultyLights: normaliseFaultyLights(val(lights)),
        checkpoints: t.checkpoints,
        expressways: t.expressways,
        floods: normaliseFloods(val(floods), now),
      };
    });
    const body: RoadsResponse = { ...entry.data, ...fresh(entry) };
    return json(req, env, body, 200, 60);
  }

  if (path === '/v1/weather') {
    const entry = await cached(ctx, 'weather:all', TTL.weather, async () => {
      const [f, r, t, o] = await Promise.allSettled([
        dgs<DgsForecastPayload>(env, `${DGS_REALTIME}/two-hr-forecast`),
        dgs<DgsStationPayload>(env, `${DGS_REALTIME}/rainfall`),
        dgs<DgsStationPayload>(env, `${DGS_REALTIME}/air-temperature`),
        dgs<DgsOutlookPayload>(env, `${DGS_REALTIME}/four-day-outlook`),
      ]);
      const forecast = f.status === 'fulfilled' ? normaliseForecast(f.value) : null;
      const rainfall = r.status === 'fulfilled' ? normaliseStations(r.value) : null;
      if (!forecast && !rainfall) throw new HttpError(502, 'upstream_unavailable', 'NEA weather data is unavailable.');
      return {
        forecast,
        rainfall,
        temperature: t.status === 'fulfilled' ? normaliseStations(t.value) : null,
        outlook: o.status === 'fulfilled' ? normaliseOutlook(o.value) : [],
      };
    });
    const body: WeatherResponse = { ...entry.data, ...fresh(entry) };
    return json(req, env, body, 200, 60);
  }

  if (path === '/v1/weather/radar') {
    const entry = await cached(ctx, 'weather:radar', TTL.radar, async () => {
      const p = await dgs<DgsRadarPayload>(env, `${DGS_REALTIME}/weather-radar-images/70km`);
      const latest = p.data?.records?.[0]?.timestamp;
      if (!latest) throw new HttpError(502, 'upstream_unavailable', 'Rain radar is unavailable.');
      const latestMs = Date.parse(latest);
      const frames = Array.from({ length: RADAR_FRAMES }, (_, i) => {
        const at = new Date(latestMs - (RADAR_FRAMES - 1 - i) * 5 * 60_000);
        const sg = new Date(at.getTime() + 8 * 3600_000).toISOString();
        return { ts: radarTs(sg), at: at.toISOString() };
      });
      return { frames, bbox: RADAR_BBOX };
    });
    const body: RadarResponse = { ...entry.data, ...fresh(entry) };
    return json(req, env, body, 200, 60);
  }

  const frame = /^\/v1\/weather\/radar\/(\d{12})\.png$/.exec(path);
  if (frame) {
    const ts = frame[1]!;
    const atMs = Date.parse(`${radarIsoLocal(ts)}+08:00`);
    if (!Number.isFinite(atMs) || Math.abs(Date.now() - atMs) > 6 * 3600_000 || Number(ts.slice(10)) % 5 !== 0) {
      throw new HttpError(400, 'bad_request', 'Radar frames are 5-minute steps within the last few hours.');
    }
    const entry = await cachedRaw(ctx, `radar:${ts}`, [7 * 24 * 3600, 7 * 24 * 3600], async () => {
      const p = await dgs<DgsRadarPayload>(env, `${DGS_REALTIME}/weather-radar-images/70km?date=${radarIsoLocal(ts)}`);
      const rec = p.data?.records?.find((r) => r.timestamp && radarTs(r.timestamp) === ts);
      if (!rec?.image?.url) throw new HttpError(404, 'not_found', 'No radar image for that time.');
      const res = await upstream(rec.image.url);
      if (!res.ok) throw new HttpError(502, 'upstream_unavailable', 'Rain radar is unavailable.');
      return { body: await res.arrayBuffer(), type: 'image/png' };
    });
    return new Response(entry.body, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400, immutable', ...corsHeaders(req, env) },
    });
  }

  if (path === '/v1/places') {
    const q = (url.searchParams.get('q') ?? '').trim();
    if (q.length < 2 || q.length > 60) throw new HttpError(400, 'bad_request', 'q must be 2–60 characters.');
    const entry = await cached(ctx, `places:${q.toLowerCase()}`, TTL.places, async () => {
      const res = await upstream(onemapSearchUrl(q), { headers: { accept: 'application/json', ...(await onemapAuth(env).catch(() => ({}))) } });
      if (!res.ok) throw new HttpError(502, 'upstream_unavailable', 'Place search is unavailable.');
      return normalisePlaces((await res.json()) as OneMapSearchPayload, 8);
    });
    const body: PlacesResponse = { query: q, results: entry.data };
    return json(req, env, body, 200, 3600);
  }

  throw new HttpError(404, 'not_found', 'Unknown endpoint.');
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req, env) });
    if (req.method !== 'GET') return json(req, env, { error: { code: 'bad_request', message: 'GET only.' } }, 405);
    try {
      if (env.RATE_LIMITER) {
        const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
        const { success } = await env.RATE_LIMITER.limit({ key: ip });
        if (!success) throw new HttpError(429, 'rate_limited', 'Too many requests. Slow down a little.');
      }
      return await handle(req, env, ctx);
    } catch (err) {
      return errorResponse(req, env, err);
    }
  },
} satisfies ExportedHandler<Env>;
