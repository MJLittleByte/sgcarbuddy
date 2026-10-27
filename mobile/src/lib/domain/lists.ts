/**
 * Builds the Parking and EV lists for a place: radius, filters, sorting (plan §8.2, §8.4). Pure.
 */
import type { AvailabilityResponse, CarparkInfo, EvSite, PlugKind } from '../../../../shared/contract';
import { isCovered } from '../../../../shared/carparks';
import { evSummary, lotsFor, type EvSummary, type Lots } from './availability';
import { distanceM, walkMinutes, type LatLng } from './geo';
import { estimateCost, rateAt, type CostEstimate, type Vehicle } from './rates';
import type { EvFilters, ParkFilters, SortBy } from '../storage/store';

export interface CarparkRow {
  cp: CarparkInfo;
  lots: Lots;
  distM: number;
  walk: number;
  cost: CostEstimate;
  covered: boolean;
  freeNow: boolean;
}

/** Walk radius in metres for N minutes at the given pace (inverse of walkMinutes). */
export const radiusM = (minutes: number, pace: number) => (minutes * pace) / 1.3;

export interface ParkingInput {
  carparks: readonly CarparkInfo[];
  at: LatLng;
  vehicle: Vehicle;
  avail: AvailabilityResponse | null;
  now: number;
  stayMin: number;
  filters: ParkFilters;
  sort: SortBy;
  pace: number;
}

export function passesParkFilters(r: CarparkRow, f: ParkFilters): boolean {
  const cp = r.cp;
  if (f.hideSeasonOnly && cp.shortTerm === 'no') return false;
  if (f.hasSpace && !(r.lots.free != null && r.lots.free > 0)) return false;
  if (f.covered && !r.covered) return false;
  if (f.freeNow && !r.freeNow) return false;
  if (f.night && !(cp.night || cp.agency === 'URA')) return false;
  if (f.electronic && cp.system !== 'electronic') return false;
  if (f.minHeightM > 0 && cp.heightM != null && cp.heightM < f.minHeightM) return false;
  if (f.agencies.length && !f.agencies.includes(cp.agency)) return false;
  return true;
}

export function activeParkFilterCount(f: ParkFilters): number {
  return [f.hasSpace, f.covered, f.freeNow, f.night, f.electronic, f.minHeightM > 0, f.agencies.length > 0, !f.hideSeasonOnly].filter(Boolean).length;
}

export function parkingRows(input: ParkingInput): { rows: CarparkRow[]; walkMin: number; hidden: number } {
  const { carparks, at, vehicle, avail, now, stayMin, filters, sort, pace } = input;
  const build = (maxMin: number) => {
    const r = radiusM(maxMin, pace);
    const out: CarparkRow[] = [];
    for (const cp of carparks) {
      // Cheap bounding-box test before the real distance.
      if (Math.abs(cp.lat - at.lat) > r / 110_000 || Math.abs(cp.lng - at.lng) > r / 110_000) continue;
      const d = distanceM(at, cp);
      if (d > r) continue;
      out.push({
        cp,
        lots: lotsFor(cp, vehicle, avail, now),
        distM: d,
        walk: walkMinutes(d, pace),
        cost: estimateCost(cp, vehicle, now, stayMin),
        covered: isCovered(cp),
        freeNow: rateAt(cp, vehicle, now)?.free ?? false,
      });
    }
    return out;
  };
  let walkMin = 10;
  let all = build(walkMin);
  if (all.filter((r) => passesParkFilters(r, filters)).length < 5) {
    walkMin = 20;
    all = build(walkMin);
  }
  const rows = all.filter((r) => passesParkFilters(r, filters));
  const byDist = (a: CarparkRow, b: CarparkRow) => a.distM - b.distM;
  // Full carparks drop below ones with space within the same walking minute.
  const fullLast = (a: CarparkRow, b: CarparkRow) => Number(a.lots.free === 0) - Number(b.lots.free === 0) || Number(a.lots.free == null) - Number(b.lots.free == null);
  rows.sort((a, b) => {
    if (sort === 'space') return (b.lots.free ?? -1) - (a.lots.free ?? -1) || byDist(a, b);
    if (sort === 'cheapest') return (a.cost.amount ?? Infinity) - (b.cost.amount ?? Infinity) || fullLast(a, b) || byDist(a, b);
    return a.walk - b.walk || fullLast(a, b) || byDist(a, b);
  });
  return { rows, walkMin, hidden: all.length - rows.length };
}

/* ---------------- EV ---------------- */

export interface EvRow {
  site: EvSite;
  sum: EvSummary;
  distM: number;
  walk: number;
}

export function passesEvFilters(r: EvRow, f: EvFilters): boolean {
  if (r.sum.total === 0) return false;
  if (f.availableNow && r.sum.free === 0) return false;
  if (f.dcOnly && !r.sum.dc) return false;
  if (f.minKw > 0 && (r.sum.maxKw ?? 0) < f.minKw) return false;
  if (f.operators.length && !r.site.operators.some((o) => f.operators.includes(o))) return false;
  return true;
}

export function activeEvFilterCount(f: EvFilters): number {
  return [f.availableNow, f.dcOnly, f.minKw > 0, f.operators.length > 0].filter(Boolean).length;
}

export function evRows(sites: readonly EvSite[], at: LatLng, plugs: readonly PlugKind[] | 'all', filters: EvFilters, pace: number): { rows: EvRow[]; walkMin: number } {
  const build = (maxMin: number) => {
    const r = radiusM(maxMin, pace);
    const out: EvRow[] = [];
    for (const site of sites) {
      if (Math.abs(site.lat - at.lat) > r / 110_000 || Math.abs(site.lng - at.lng) > r / 110_000) continue;
      const d = distanceM(at, site);
      if (d > r) continue;
      out.push({ site, sum: evSummary(site, plugs), distM: d, walk: walkMinutes(d, pace) });
    }
    return out.filter((x) => passesEvFilters(x, filters));
  };
  let walkMin = 15;
  let rows = build(walkMin);
  if (rows.length < 4) {
    walkMin = 30;
    rows = build(walkMin);
  }
  rows.sort((a, b) => a.walk - b.walk || Number(b.sum.free > 0) - Number(a.sum.free > 0) || a.distM - b.distM);
  return { rows, walkMin };
}

/** EV chargers in (or right next to) a carpark: within 120 m. */
export function chargersNear(cp: { lat: number; lng: number }, sites: readonly EvSite[], maxM = 120): EvSite[] {
  return sites.filter((s) => Math.abs(s.lat - cp.lat) < 0.002 && Math.abs(s.lng - cp.lng) < 0.002 && distanceM(cp, s) <= maxM).sort((a, b) => distanceM(cp, a) - distanceM(cp, b));
}
