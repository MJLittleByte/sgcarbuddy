/**
 * NEA (data.gov.sg v2 real-time) → contract normalisers.
 * Runtime code shared by the Worker and the app (which fetches NEA directly). Pure functions, no I/O.
 */
import type { OutlookDay, RainArea, RainForecast, RainGauge, StationReadings } from './contract';

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

export const DGS_REALTIME = 'https://api-open.data.gov.sg/v2/real-time/api';

export interface DgsForecastPayload {
  data?: {
    area_metadata?: Array<{ name?: string; label_location?: { latitude?: number; longitude?: number } }>;
    items?: Array<{
      update_timestamp?: string;
      valid_period?: { start?: string; end?: string; text?: string };
      forecasts?: Array<{ area?: string; forecast?: string }>;
    }>;
  };
}

/** Rainfall and air temperature share this station + readings shape. */
export interface DgsStationPayload {
  data?: {
    stations?: Array<{ id?: string; name?: string; location?: { latitude?: number; longitude?: number } }>;
    readings?: Array<{ timestamp?: string; data?: Array<{ stationId?: string; value?: number }> }>;
  };
}
export type DgsRainfallPayload = DgsStationPayload;

export interface DgsOutlookPayload {
  data?: {
    records?: Array<{
      forecasts?: Array<{
        day?: string;
        timestamp?: string;
        forecast?: { text?: string; summary?: string };
        temperature?: { low?: number; high?: number };
      }>;
    }>;
  };
}

export function normaliseForecast(p: DgsForecastPayload): RainForecast | null {
  const item = p.data?.items?.[0];
  if (!item?.forecasts?.length) return null;
  const byName = new Map(item.forecasts.map((f) => [str(f.area), str(f.forecast)]));
  const areas: RainArea[] = (p.data?.area_metadata ?? [])
    .map((a) => ({
      name: str(a.name),
      latitude: Number(a.label_location?.latitude),
      longitude: Number(a.label_location?.longitude),
      forecast: byName.get(str(a.name)) ?? '',
    }))
    .filter((a) => a.name && a.forecast && Number.isFinite(a.latitude) && Number.isFinite(a.longitude));
  return {
    updatedAt: str(item.update_timestamp),
    validFrom: str(item.valid_period?.start),
    validTo: str(item.valid_period?.end),
    validText: str(item.valid_period?.text),
    areas,
  };
}

/** Station readings (rainfall mm in 5 min, or air temperature °C), joined with station locations. */
export function normaliseStations(p: DgsStationPayload): StationReadings | null {
  const reading = p.data?.readings?.[0];
  if (!reading?.data?.length) return null;
  const values = new Map(reading.data.map((d) => [str(d.stationId), Number(d.value)]));
  const gauges: RainGauge[] = (p.data?.stations ?? [])
    .map((s) => ({
      id: str(s.id),
      name: str(s.name),
      latitude: Number(s.location?.latitude),
      longitude: Number(s.location?.longitude),
      mm: values.get(str(s.id)) ?? Number.NaN,
    }))
    .filter((g) => g.id && Number.isFinite(g.mm) && Number.isFinite(g.latitude) && Number.isFinite(g.longitude));
  return { readingAt: str(reading.timestamp), gauges };
}
export const normaliseRainfall = normaliseStations;

export function normaliseOutlook(p: DgsOutlookPayload): OutlookDay[] {
  const rec = p.data?.records?.[0];
  return (rec?.forecasts ?? [])
    .map((f) => ({
      day: str(f.day),
      date: str(f.timestamp).slice(0, 10),
      text: str(f.forecast?.text),
      low: Number.isFinite(Number(f.temperature?.low)) ? Number(f.temperature?.low) : null,
      high: Number.isFinite(Number(f.temperature?.high)) ? Number(f.temperature?.high) : null,
    }))
    .filter((d) => d.day && d.text)
    .slice(0, 4);
}
