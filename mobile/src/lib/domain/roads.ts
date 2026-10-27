/**
 * Road alerts near a place (Roads tab): LTA incidents, faulty traffic lights and PUB flood alerts within a radius,
 * nearest first, in plain words. Pure.
 */
import type { FaultyLight, FloodAlert, Incident, RoadsResponse } from '../../../../shared/contract';
import { distanceM, type LatLng } from './geo';

/** Road alerts are shown within this distance of you (or the place you searched). */
export const ROAD_ALERT_RADIUS_M = 4000;

export type AlertSeverity = 'high' | 'medium' | 'low';
export type AlertIcon = 'alert' | 'cone' | 'car' | 'flood';

export interface RoadAlert {
  id: string;
  kind: 'incident' | 'light' | 'flood';
  /** "Accident", "Roadwork", "Traffic lights out"… */
  title: string;
  /** LTA / PUB text without the "(27/10)15:15" prefix. */
  detail: string;
  /** ISO time it was reported, when known. */
  at: string | null;
  lat: number;
  lng: number;
  distanceM: number;
  severity: AlertSeverity;
  icon: AlertIcon;
}

/** "(27/10)15:15 Vehicle Breakdown on PIE…" → "Vehicle Breakdown on PIE…". */
export const stripLtaTime = (s: string): string => s.replace(/^\s*\(\d{1,2}\/\d{1,2}\)\s*\d{1,2}:\d{2}\s*/, '').trim();

function incidentLook(type: string): { severity: AlertSeverity; icon: AlertIcon } {
  if (/accident|fire|road block|obstacle|reverse/i.test(type)) return { severity: 'high', icon: 'alert' };
  if (/breakdown|unattended/i.test(type)) return { severity: 'medium', icon: 'car' };
  if (/road ?work|diversion/i.test(type)) return { severity: 'low', icon: 'cone' };
  if (/heavy traffic/i.test(type)) return { severity: 'medium', icon: 'alert' };
  return { severity: 'medium', icon: 'alert' };
}

const LIGHT_TITLE: Record<FaultyLight['kind'], string> = {
  blackout: 'Traffic lights out',
  'flashing-yellow': 'Traffic lights flashing yellow',
  other: 'Traffic light fault',
};

export function roadAlertsNear(roads: RoadsResponse | null, at: LatLng | null, radiusM = ROAD_ALERT_RADIUS_M): RoadAlert[] {
  if (!roads || !at) return [];
  const out: RoadAlert[] = [];
  roads.incidents.forEach((i: Incident, k) => {
    const d = distanceM(at, i);
    if (d > radiusM) return;
    out.push({ id: `i${k}`, kind: 'incident', title: i.type, detail: stripLtaTime(i.message), at: i.at, lat: i.lat, lng: i.lng, distanceM: d, ...incidentLook(i.type) });
  });
  roads.faultyLights.forEach((l: FaultyLight) => {
    const d = distanceM(at, l);
    if (d > radiusM) return;
    out.push({ id: `l${l.id}`, kind: 'light', title: LIGHT_TITLE[l.kind], detail: stripLtaTime(l.message), at: l.startedAt, lat: l.lat, lng: l.lng, distanceM: d, severity: l.kind === 'blackout' ? 'high' : 'medium', icon: 'alert' });
  });
  roads.floods.forEach((f: FloodAlert) => {
    if (f.lat == null || f.lng == null) return;
    const d = distanceM(at, { lat: f.lat, lng: f.lng });
    // PUB's radius is the broadcast area, so count it in.
    if (d > radiusM + (f.radiusKm ?? 0) * 1000) return;
    out.push({ id: `f${f.id}`, kind: 'flood', title: f.headline || 'Flood alert', detail: [f.area, f.description].filter(Boolean).join('. '), at: f.issuedAt, lat: f.lat, lng: f.lng, distanceM: d, severity: 'high', icon: 'flood' });
  });
  return out.sort((a, b) => a.distanceM - b.distanceM);
}
