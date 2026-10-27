/**
 * Demo mode (no Worker URL): the bundled carpark list with sample lots, sample EV chargers and road
 * reports; NEA weather and LTA cameras are live from data.gov.sg (public). Never mixed with live data.
 */
import type { AvailabilityResponse, CarparkCatalogResponse, CarparkInfo, EvConnector, EvResponse, EvSite, PlacesResponse, RoadsResponse } from '../../../../shared/contract';
import { normalisePlaces, onemapSearchUrl, type OneMapSearchPayload } from '../../../../shared/onemap';

/** Teck Whye, Choa Chu Kang: the area in the reference screenshots. */
export const DEMO_LOCATION = { lat: 1.37955, lng: 103.75235 };

export interface BundledCatalog {
  version: string;
  builtAt: string;
  sources: CarparkCatalogResponse['sources'];
  carparks: CarparkInfo[];
}
/** The carpark snapshot shipped with the app (separate chunk, loaded once). */
let bundled: Promise<BundledCatalog> | null = null;
export function bundledCatalog(): Promise<BundledCatalog> {
  bundled ??= import('../../data/carparks.json').then((m) => m.default as unknown as BundledCatalog);
  return bundled;
}

const now = () => new Date().toISOString();
const fresh = () => ({ serverTime: now(), fetchedAt: now(), stale: false });

/** Deterministic pseudo-random 0..1 from a string (stable lots between refreshes, drifting slowly). */
function rand(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

export async function catalog(): Promise<CarparkCatalogResponse> {
  const b = await bundledCatalog();
  return { version: b.version, carparks: b.carparks, sources: b.sources, ...fresh() };
}

export async function availability(): Promise<AvailabilityResponse> {
  const slot = Math.floor(Date.now() / 300_000);
  const lots: AvailabilityResponse['lots'] = {};
  for (const c of (await bundledCatalog()).carparks) {
    if (!c.live) continue;
    const total = c.totals?.C ?? (c.agency === 'LTA' ? 600 : 120);
    const r = rand(c.id);
    const share = r < 0.08 ? 0 : r < 0.18 ? 0.02 : 0.15 + 0.7 * rand(`${c.id}${slot}`);
    const y = c.totals?.Y ? Math.round(c.totals.Y * rand(`${c.id}y${slot}`)) : -1;
    lots[c.id] = [Math.round(total * share), y];
  }
  return { lots, ...fresh() };
}

const OPS = ['Charge+', 'SP Mobility', 'Shell', 'ComfortDelGro ENGIE', 'Strides YTL'];

export async function ev(): Promise<EvResponse> {
  const sites: EvSite[] = [];
  for (const c of (await bundledCatalog()).carparks) {
    if (c.agency !== 'HDB' || rand(`ev${c.id}`) > 0.35) continue;
    const n = 1 + Math.floor(rand(`n${c.id}`) * 6);
    const dc = rand(`dc${c.id}`) < 0.15;
    const op = OPS[Math.floor(rand(`op${c.id}`) * OPS.length)]!;
    const connectors: EvConnector[] = Array.from({ length: n }, (_, i) => {
      const r = rand(`${c.id}c${i}${Math.floor(Date.now() / 300_000)}`);
      return {
        id: `DEMO-${c.code}-${i}`,
        plug: dc ? 'ccs2' : 'type2',
        plugLabel: dc ? 'Combo 2' : 'Type 2',
        current: dc ? 'DC' : 'AC',
        kw: dc ? 50 : 7.4,
        price: dc ? 0.79 : 0.65,
        priceUnit: 'kWh',
        position: `L${1 + (i % 3)} Lot ${100 + i}`,
        operator: op,
        status: r < 0.55 ? 'available' : r < 0.9 ? 'in-use' : 'out-of-service',
      };
    });
    sites.push({ id: `demo-${c.id}`, name: c.name, address: c.name, postal: '', lat: c.lat + 0.00012, lng: c.lng + 0.00012, operators: [op], connectors });
  }
  return { updatedAt: now(), sites, ...fresh() };
}

export async function roads(): Promise<RoadsResponse> {
  const t = new Date(Date.now() - 12 * 60_000);
  const hm = t.toLocaleTimeString('en-SG', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false });
  const dm = t.toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore', day: '2-digit', month: '2-digit' });
  return {
    incidents: [
      { type: 'Vehicle breakdown', lat: 1.3825, lng: 103.7445, message: `(${dm})${hm} Vehicle Breakdown on KJE (towards BKE) after Choa Chu Kang Way. (sample)`, at: t.toISOString() },
      { type: 'Roadwork', lat: 1.3772, lng: 103.7614, message: `(${dm})${hm} Roadworks on Bukit Panjang Road. (sample)`, at: t.toISOString() },
    ],
    faultyLights: [],
    checkpoints: [
      { checkpoint: 'Woodlands', via: 'BKE', minutes: 14 },
      { checkpoint: 'Tuas', via: 'AYE', minutes: 31 },
    ],
    expressways: [
      { expressway: 'AYE', direction: 1, towards: 'TUAS CHECKPOINT', minutes: 31 },
      { expressway: 'BKE', direction: 1, towards: 'WOODLANDS CENTRE', minutes: 14 },
      { expressway: 'PIE', direction: 1, towards: 'TUAS', minutes: 38 },
    ],
    floods: [],
    ...fresh(),
  };
}

/** OneMap's search is public (no key needed for now), so demo mode calls it directly. */
export async function places(q: string): Promise<PlacesResponse> {
  const res = await fetch(onemapSearchUrl(q), { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error('Place search is unavailable.');
  return { query: q, results: normalisePlaces((await res.json()) as OneMapSearchPayload, 8) };
}
