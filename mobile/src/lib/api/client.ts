import type {
  ApiErrorBody,
  AvailabilityResponse,
  CamerasResponse,
  CarparkCatalogResponse,
  EvResponse,
  PlacesResponse,
  RadarResponse,
  RoadsResponse,
  WeatherResponse,
} from '../../../../shared/contract';
import { normaliseEv, type EvRawPayload } from '../../../../shared/ev';
import * as demo from './demo';
import { camerasDirect, weatherDirect } from './direct';

/**
 * Public URL of the SG Car Buddy Worker. Safe to ship: it is not a secret.
 * The LTA / data.gov.sg / OneMap / URA keys live only in the Worker (see worker/README.md).
 */
export const BASE = String(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

/** No Worker configured → bundled carparks with sample lots, sample EV and roads, live NEA weather and cameras. */
export const isDemo = BASE === '';

/** Identifies where cached data came from, so demo data never leaks into live mode (or vice versa). */
export const DATA_SOURCE = isDemo ? 'demo' : BASE;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorBody['error']['code'] | 'network',
    message: string,
  ) {
    super(message);
  }
}

/** Short, user-facing reason for a failed load (shown next to Retry). */
export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'network') return isDemo ? 'No connection.' : "Can't reach the SG Car Buddy server.";
    if (e.code === 'not_configured') return 'The server is missing an API key.';
    if (e.code === 'upstream_unavailable') return "The government data source isn't responding.";
    if (e.code === 'rate_limited') return 'Busy, trying again shortly.';
    return e.message;
  }
  return 'No connection.';
}

async function request(path: string, timeoutMs: number): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
  } catch {
    throw new ApiError(0, 'network', 'No connection. Showing the last data we have.');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(res.status, body?.error.code ?? 'internal', body?.error.message ?? `Request failed (${res.status}).`);
  }
  return res;
}

const get = async <T>(path: string, timeoutMs = 12_000): Promise<T> => (await request(path, timeoutMs)).json() as Promise<T>;

export const api = {
  catalog(): Promise<CarparkCatalogResponse> {
    return isDemo ? demo.catalog() : get('/v1/carparks/catalog', 40_000);
  },
  availability(): Promise<AvailabilityResponse> {
    return isDemo ? demo.availability() : get('/v1/carparks/availability');
  },
  /** The Worker passes LTA's 3 MB batch file through; it is normalised here on the phone. */
  async ev(): Promise<EvResponse> {
    if (isDemo) return demo.ev();
    const res = await request('/v1/ev', 40_000);
    const raw = (await res.json()) as EvRawPayload;
    const { updatedAt, sites } = normaliseEv(raw);
    const fetchedAt = res.headers.get('X-Fetched-At') ?? new Date().toISOString();
    return { updatedAt, sites, serverTime: new Date().toISOString(), fetchedAt, stale: res.headers.get('X-Stale') === 'true' };
  },
  cameras(): Promise<CamerasResponse> {
    return isDemo ? camerasDirect() : get<CamerasResponse>('/v1/roads/cameras').catch(() => camerasDirect());
  },
  roads(): Promise<RoadsResponse> {
    return isDemo ? demo.roads() : get('/v1/roads');
  },
  /** NEA comes from data.gov.sg directly (saves Worker quota; no location is sent); the Worker is the fallback. */
  async weather(): Promise<WeatherResponse> {
    if (isDemo) return weatherDirect();
    const direct = await weatherDirect().catch(() => null);
    if (direct && direct.forecast && direct.rainfall && direct.temperature && direct.outlook.length) return direct;
    // data.gov.sg limits keyless calls per phone; fill any missing part from the Worker's shared cache.
    const w = await get<WeatherResponse>('/v1/weather').catch(() => null);
    if (!w) {
      if (direct) return direct;
      throw new ApiError(502, 'upstream_unavailable', 'NEA weather data is unavailable.');
    }
    return direct
      ? { ...direct, forecast: direct.forecast ?? w.forecast, rainfall: direct.rainfall ?? w.rainfall, temperature: direct.temperature ?? w.temperature, outlook: direct.outlook.length ? direct.outlook : w.outlook }
      : w;
  },
  radar(): Promise<RadarResponse> {
    return isDemo ? Promise.reject(new ApiError(503, 'not_configured', 'The rain radar needs the SG Car Buddy server.')) : get('/v1/weather/radar');
  },
  radarFrameUrl(ts: string): string {
    return `${BASE}/v1/weather/radar/${ts}.png`;
  },
  places(q: string): Promise<PlacesResponse> {
    return isDemo ? demo.places(q) : get(`/v1/places?q=${encodeURIComponent(q)}`);
  },
};
