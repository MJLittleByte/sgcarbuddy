import type { CamerasResponse, WeatherResponse } from '../../../../shared/contract';
import {
  DGS_REALTIME,
  normaliseForecast,
  normaliseOutlook,
  normaliseStations,
  type DgsForecastPayload,
  type DgsOutlookPayload,
  type DgsStationPayload,
} from '../../../../shared/nea';
import { normaliseDgsCameras, type DgsTrafficImagesPayload } from '../../../../shared/roads';

const getJson = <T>(url: string): Promise<T> =>
  fetch(url, { signal: AbortSignal.timeout(12_000) }).then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(`HTTP ${r.status}`))));

/**
 * NEA weather straight from data.gov.sg (public, CORS-enabled, no key, no location sent). Fetched by the phone
 * so it doesn't use the Worker's request quota; the app falls back to the Worker if this fails.
 */
export async function weatherDirect(): Promise<WeatherResponse> {
  const [f, r, t, o] = await Promise.allSettled([
    getJson<DgsForecastPayload>(`${DGS_REALTIME}/two-hr-forecast`),
    getJson<DgsStationPayload>(`${DGS_REALTIME}/rainfall`),
    getJson<DgsStationPayload>(`${DGS_REALTIME}/air-temperature`),
    getJson<DgsOutlookPayload>(`${DGS_REALTIME}/four-day-outlook`),
  ]);
  const forecast = f.status === 'fulfilled' ? normaliseForecast(f.value) : null;
  const rainfall = r.status === 'fulfilled' ? normaliseStations(r.value) : null;
  if (!forecast && !rainfall) throw new Error('NEA weather data is unavailable.');
  const now = new Date().toISOString();
  return {
    forecast,
    rainfall,
    temperature: t.status === 'fulfilled' ? normaliseStations(t.value) : null,
    outlook: o.status === 'fulfilled' ? normaliseOutlook(o.value) : [],
    serverTime: now,
    fetchedAt: now,
    stale: false,
  };
}

/** LTA traffic cameras via data.gov.sg (public, stable image links). Used in demo mode and as a fallback. */
export async function camerasDirect(): Promise<CamerasResponse> {
  const p = await getJson<DgsTrafficImagesPayload>('https://api.data.gov.sg/v1/transport/traffic-images');
  const now = new Date().toISOString();
  return { cameras: normaliseDgsCameras(p), source: 'data.gov.sg', serverTime: now, fetchedAt: now, stale: false };
}
