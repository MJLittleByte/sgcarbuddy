import type { RainArea, RainGauge, WeatherResponse } from '../../../../shared/contract';
import { nearest, type LatLng } from './geo';

/** One gauge tip is 0.2 mm, so any tip in the last 5 minutes counts as raining. */
export const RAIN_MM_THRESHOLD = 0.2;
/** Beyond this, the nearest gauge is not "near you" any more. */
export const GAUGE_RADIUS_M = 3000;
/** Older than this → unavailable; never show a stale "No rain". */
export const RAIN_STALE_MS = 45 * 60_000;

const RAINY = /rain|shower|thunder|drizzle/i;

export interface Gauge {
  name: string;
  mm: number;
  distanceM: number;
  readingAt: string;
}

export type RainStatus =
  | { state: 'raining'; area: string | null; forecast: string | null; until: string | null; gauge: Gauge }
  | { state: 'dry-rain-possible'; area: string; forecast: string; until: string | null; gauge: Gauge | null }
  | { state: 'dry'; area: string | null; forecast: string | null; until: string | null; gauge: Gauge | null }
  | { state: 'location-off' }
  | { state: 'unavailable'; checkedAt: Date | null };

/** "Thundery Showers" → "thundery showers"; "Partly Cloudy (Night)" → "partly cloudy". */
export function plainForecast(text: string): string {
  return text.replace(/\s*\((day|night)\)\s*/gi, '').trim().toLowerCase();
}

/** "8.00 am to 10.00 am" → "10:00 am" (end of the validity window). */
export function untilFromValidText(validText: string | undefined, validTo: string | undefined): string | null {
  const end = validText?.split(/\s+to\s+/i)[1]?.trim();
  if (end) return end.replace(/^(\d{1,2})\.(\d{2})/, '$1:$2').replace(/^midnight$/i, 'midnight');
  if (!validTo) return null;
  const d = new Date(validTo);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleTimeString('en-SG', { timeZone: 'Asia/Singapore', hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
}

export type RainInput = Pick<WeatherResponse, 'forecast' | 'rainfall' | 'fetchedAt'>;

export function rainStatus(res: RainInput | null, here: LatLng | null, nowMs: number): RainStatus {
  if (!here) return { state: 'location-off' };
  if (!res) return { state: 'unavailable', checkedAt: null };

  const fetched = new Date(res.fetchedAt);
  const fresh = !Number.isNaN(fetched.getTime()) && nowMs - fetched.getTime() <= RAIN_STALE_MS;
  const readingFresh = res.rainfall && nowMs - Date.parse(res.rainfall.readingAt) <= RAIN_STALE_MS;
  const forecastFresh = res.forecast && Date.parse(res.forecast.validTo) > nowMs - RAIN_STALE_MS;
  if (!fresh || (!readingFresh && !forecastFresh)) {
    return { state: 'unavailable', checkedAt: Number.isNaN(fetched.getTime()) ? null : fetched };
  }

  const g = readingFresh ? nearest<RainGauge>(here, res.rainfall!.gauges, (x) => ({ lat: x.latitude, lng: x.longitude })) : null;
  const gauge: Gauge | null =
    g && g.distanceM <= GAUGE_RADIUS_M
      ? { name: g.item.name, mm: g.item.mm, distanceM: g.distanceM, readingAt: res.rainfall!.readingAt }
      : null;

  const a = forecastFresh ? nearest<RainArea>(here, res.forecast!.areas, (x) => ({ lat: x.latitude, lng: x.longitude })) : null;
  const area = a?.item.name ?? null;
  const forecast = a?.item.forecast ?? null;
  const until = forecastFresh ? untilFromValidText(res.forecast!.validText, res.forecast!.validTo) : null;

  if (gauge && gauge.mm >= RAIN_MM_THRESHOLD) return { state: 'raining', area, forecast, until, gauge };
  if (area && forecast && RAINY.test(forecast)) return { state: 'dry-rain-possible', area, forecast, until, gauge };
  return { state: 'dry', area, forecast, until, gauge };
}

/** Temperature (°C) at the nearest NEA station within 15 km, rounded. */
export function temperatureAt(res: Pick<WeatherResponse, 'temperature'> | null, here: LatLng | null): number | null {
  if (!res?.temperature || !here) return null;
  const n = nearest<RainGauge>(here, res.temperature.gauges, (x) => ({ lat: x.latitude, lng: x.longitude }));
  return n && n.distanceM < 15_000 ? Math.round(n.item.mm) : null;
}

/** Icon for an NEA forecast text. */
export function forecastIcon(text: string | null | undefined): 'storm' | 'rain' | 'cloud' | 'partsun' | 'sun' | 'moon' {
  const t = (text ?? '').toLowerCase();
  if (/thunder/.test(t)) return 'storm';
  if (/rain|shower|drizzle/.test(t)) return 'rain';
  if (/night/.test(t) && /fair|partly/.test(t)) return 'moon';
  if (/partly|fair & warm|fair and warm/.test(t)) return 'partsun';
  if (/cloud|overcast|haz|mist|fog|wind/.test(t)) return 'cloud';
  return 'sun';
}
