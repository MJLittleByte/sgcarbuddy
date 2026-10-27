/**
 * OneMap (Singapore Land Authority) search → contract normaliser. Shared by the Worker and demo mode.
 * https://www.onemap.gov.sg/apidocs/search
 */
import type { Place } from './contract';
import { titleCase } from './text';

export const ONEMAP_SEARCH = 'https://www.onemap.gov.sg/api/common/elastic/search';

export interface OneMapSearchPayload {
  found?: number;
  results?: Array<{ SEARCHVAL?: string; ADDRESS?: string; POSTAL?: string; LATITUDE?: string; LONGITUDE?: string; BUILDING?: string }>;
}

const title = (s: string) => titleCase(s.replace(/\s+SINGAPORE\s+\d{6}$/i, '')).trim();

export function onemapSearchUrl(q: string): string {
  const u = new URL(ONEMAP_SEARCH);
  u.searchParams.set('searchVal', q);
  u.searchParams.set('returnGeom', 'Y');
  u.searchParams.set('getAddrDetails', 'Y');
  u.searchParams.set('pageNum', '1');
  return u.toString();
}

export function normalisePlaces(p: OneMapSearchPayload, limit = 6): Place[] {
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const r of p.results ?? []) {
    const lat = Number(r.LATITUDE);
    const lng = Number(r.LONGITUDE);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 1.1 || lat > 1.5) continue;
    const name = title(r.SEARCHVAL ?? r.BUILDING ?? '');
    const key = `${name}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
    if (!name || seen.has(key)) continue;
    seen.add(key);
    const postal = r.POSTAL && /^\d{6}$/.test(r.POSTAL) ? r.POSTAL : null;
    out.push({ name, address: title(r.ADDRESS ?? ''), postal, latitude: lat, longitude: lng });
    if (out.length >= limit) break;
  }
  return out;
}
