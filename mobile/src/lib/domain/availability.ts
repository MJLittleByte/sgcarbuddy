/**
 * Live availability → what a driver sees (plan §11.2). Absolute free-lot counts, because a driver needs
 * one lot, not a percentage. Unknown or stale is never shown as a number.
 */
import type { AvailabilityResponse, CarparkInfo, EvSite, PlugKind } from '../../../../shared/contract';
import type { Vehicle } from './rates';

export type Level = 'plenty' | 'limited' | 'few' | 'full' | 'none';

export const LEVEL_PLENTY = 30;
export const LEVEL_LIMITED = 10;
/** Older than this, lots are shown as "no live data". */
export const AVAILABILITY_STALE_MS = 15 * 60_000;

export function levelFor(free: number | null): Level {
  if (free == null || free < 0) return 'none';
  if (free === 0) return 'full';
  if (free < LEVEL_LIMITED) return 'few';
  if (free < LEVEL_PLENTY) return 'limited';
  return 'plenty';
}

export const levelWord: Record<Level, string> = {
  plenty: 'Plenty of space',
  limited: 'Limited space',
  few: 'Few lots left',
  full: 'Full',
  none: 'No live data',
};

/**
 * Why a count is (or isn't) shown, so the app never says "No live data" next to "Live":
 *  live          a fresh count for this vehicle
 *  loading       no feed received yet
 *  stale         the feed is older than AVAILABILITY_STALE_MS
 *  not-listed    this carpark isn't in the live feed at all
 *  not-reported  the carpark reports live counts, but not for this lot type (e.g. motorcycle lots at many HDB carparks)
 */
export type LotsWhy = 'live' | 'loading' | 'stale' | 'not-listed' | 'not-reported';

export interface Lots {
  free: number | null;
  total: number | null;
  level: Level;
  why: LotsWhy;
}

/** Free and total lots for my vehicle (EV owners park in car lots). */
export function lotsFor(cp: CarparkInfo, vehicle: Vehicle, avail: AvailabilityResponse | null, nowMs: number): Lots {
  const i = vehicle === 'motorcycle' ? 1 : 0;
  const type = vehicle === 'motorcycle' ? 'Y' : 'C';
  const total = cp.totals?.[type] ?? null;
  const fresh = avail != null && nowMs - Date.parse(avail.fetchedAt) <= AVAILABILITY_STALE_MS;
  const row = fresh ? avail.lots[cp.id] : undefined;
  const raw = row?.[i];
  const free = raw == null || raw < 0 ? null : total != null ? Math.min(raw, total) : raw;
  const why: LotsWhy = !avail ? 'loading' : !fresh ? 'stale' : !row ? 'not-listed' : free == null ? 'not-reported' : 'live';
  return { free, total, level: levelFor(free), why };
}

/* ---------------- EV ---------------- */

export interface EvSummary {
  /** Connectors that fit my plugs. */
  total: number;
  free: number;
  inUse: number;
  outOfService: number;
  level: Level;
  maxKw: number | null;
  dc: boolean;
  /** Cheapest published price among fitting connectors. */
  price: { amount: number; unit: 'kWh' | 'h' | 'free' } | null;
  plugs: string[];
}

export function evSummary(site: EvSite, plugs: readonly PlugKind[] | 'all'): EvSummary {
  const fits = site.connectors.filter((c) => plugs === 'all' || (c.plug !== 'other' && plugs.includes(c.plug)));
  const free = fits.filter((c) => c.status === 'available').length;
  const inUse = fits.filter((c) => c.status === 'in-use').length;
  const out = fits.length - free - inUse;
  const kws = fits.map((c) => c.kw).filter((k): k is number => k != null);
  let price: EvSummary['price'] = null;
  for (const c of fits) {
    if (c.priceUnit == null || c.price == null) continue;
    if (!price || c.price < price.amount) price = { amount: c.price, unit: c.priceUnit };
  }
  return {
    total: fits.length,
    free,
    inUse,
    outOfService: out,
    level: fits.length === 0 ? 'none' : free > 0 ? 'plenty' : inUse > 0 ? 'full' : 'none',
    maxKw: kws.length ? Math.max(...kws) : null,
    dc: fits.some((c) => c.current === 'DC'),
    price,
    plugs: [...new Set(fits.map((c) => c.plugLabel))],
  };
}

export const PLUG_LABEL: Record<PlugKind, string> = { type2: 'Type 2', ccs2: 'CCS2', chademo: 'CHAdeMO' };
