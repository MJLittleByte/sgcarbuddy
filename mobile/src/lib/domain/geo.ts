export interface LatLng {
  lat: number;
  lng: number;
}

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Walk minutes (plan §11.6): straight line × 1.3 street-detour factor ÷ pace, clamped 1–99.
 * On-device only; no routing API.
 */
export function walkMinutes(metres: number, paceMetresPerMin = 75): number {
  return Math.min(99, Math.max(1, Math.ceil((metres * 1.3) / paceMetresPerMin)));
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

/** Nearest item and its distance, or null for an empty list. */
export function nearest<T>(from: LatLng, items: readonly T[], at: (t: T) => LatLng): { item: T; distanceM: number } | null {
  let best: { item: T; distanceM: number } | null = null;
  for (const item of items) {
    const d = distanceM(from, at(item));
    if (!best || d < best.distanceM) best = { item, distanceM: d };
  }
  return best;
}

/** Fits `points` (plus `centre`) and returns [[west, south], [east, north]]. */
export function bounds(points: readonly LatLng[]): [[number, number], [number, number]] | null {
  if (!points.length) return null;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

/** Rough "is this in Singapore" check for map clicks and search results. */
export const inSingapore = (p: LatLng) => p.lat > 1.15 && p.lat < 1.48 && p.lng > 103.6 && p.lng < 104.1;
