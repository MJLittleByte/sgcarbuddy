/**
 * LTA DataMall road feeds → contract. Pure; shared by the Worker and tests.
 *  - Traffic-Imagesv2 (or data.gov.sg traffic-images): cameras, named from API guide v6.10 Annex G.
 *  - TrafficIncidents, v2/FaultyTrafficLights (SVY21), EstTravelTimes, PubFloodAlerts.
 */
import type { Camera, CameraGroup, CheckpointTime, ExpresswayTime, FaultyLight, FloodAlert, Incident } from './contract';
import { svy21ToWgs84 } from './svy21';
import { str } from './text';

/** LTA DataMall API User Guide v6.10, Annex G (the only cameras published since 30 Jun 2026). */
export const CAMERAS: Record<string, { name: string; short: string; group: CameraGroup; order: number }> = {
  '2701': { name: 'Woodlands Causeway (towards Johor)', short: 'Causeway', group: 'Woodlands', order: 1 },
  '2702': { name: 'Woodlands Checkpoint', short: 'Checkpoint', group: 'Woodlands', order: 2 },
  '2704': { name: 'BKE (Woodlands Checkpoint) – Woodlands Flyover', short: 'BKE Flyover', group: 'Woodlands', order: 3 },
  '4703': { name: 'Tuas Second Link', short: 'Second Link', group: 'Tuas', order: 4 },
  '4712': { name: 'AYE (Tuas) – Tuas Ave 8 Exit', short: 'AYE Tuas Ave 8', group: 'Tuas', order: 5 },
  '4713': { name: 'Tuas Checkpoint', short: 'Checkpoint', group: 'Tuas', order: 6 },
  '4798': { name: 'Sentosa Tower 1', short: 'Tower 1', group: 'Sentosa', order: 7 },
  '4799': { name: 'Sentosa Tower 2', short: 'Tower 2', group: 'Sentosa', order: 8 },
};

export interface LtaImageRow {
  CameraID?: string | number;
  Latitude?: number | string;
  Longitude?: number | string;
  ImageLink?: string;
}

export interface DgsTrafficImagesPayload {
  items?: Array<{ timestamp?: string; cameras?: Array<{ camera_id?: string; timestamp?: string; image?: string; location?: { latitude?: number; longitude?: number } }> }>;
}

/** DataMall image links embed the capture time in UTC: ".../2701_0717_20261026232014_3BCA25.jpg". */
export function takenAtFromLink(link: string): string | null {
  const m = /_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})_[0-9A-Za-z]+\.jpe?g/.exec(link);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function camera(id: string, lat: number, lng: number, image: string, takenAt: string | null): Camera {
  const known = CAMERAS[id];
  return {
    id,
    name: known?.name ?? `Camera ${id}`,
    short: known?.short ?? `Camera ${id}`,
    group: known?.group ?? 'Other',
    lat,
    lng,
    image,
    takenAt,
  };
}

const order = (c: Camera) => CAMERAS[c.id]?.order ?? 100 + Number(c.id);

export function normaliseLtaCameras(rows: LtaImageRow[]): Camera[] {
  return rows
    .map((r) => ({ id: str(r.CameraID), lat: Number(r.Latitude), lng: Number(r.Longitude), link: str(r.ImageLink) }))
    .filter((r) => r.id && r.link && Number.isFinite(r.lat) && Number.isFinite(r.lng))
    .map((r) => camera(r.id, r.lat, r.lng, r.link, takenAtFromLink(r.link)))
    .sort((a, b) => order(a) - order(b));
}

export function normaliseDgsCameras(p: DgsTrafficImagesPayload): Camera[] {
  return (p.items?.[0]?.cameras ?? [])
    .map((c) => ({ id: str(c.camera_id), lat: Number(c.location?.latitude), lng: Number(c.location?.longitude), image: str(c.image), at: str(c.timestamp) }))
    .filter((c) => c.id && c.image && Number.isFinite(c.lat) && Number.isFinite(c.lng))
    .map((c) => camera(c.id, c.lat, c.lng, c.image, c.at ? new Date(c.at).toISOString() : null))
    .sort((a, b) => order(a) - order(b));
}

/* ---------------- Incidents ---------------- */

export interface LtaIncidentRow {
  Type?: string;
  Latitude?: number | string;
  Longitude?: number | string;
  Message?: string;
}

/** "(27/10)07:13 Accident on BKE…" → ISO time in Singapore (year inferred from `now`). */
export function incidentTime(message: string, now: Date): string | null {
  const m = /^\((\d{1,2})\/(\d{1,2})\)\s*(\d{1,2}):(\d{2})/.exec(message);
  if (!m) return null;
  const sgNow = new Date(now.getTime() + 8 * 3600_000);
  let year = sgNow.getUTCFullYear();
  const month = +m[2]!;
  // Early January reading a late-December message.
  if (month === 12 && sgNow.getUTCMonth() === 0) year -= 1;
  const d = new Date(Date.UTC(year, month - 1, +m[1]!, +m[3]! - 8, +m[4]!));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function normaliseIncidents(rows: LtaIncidentRow[], now: Date): Incident[] {
  return rows
    .map((r) => ({ type: str(r.Type) || 'Incident', lat: Number(r.Latitude), lng: Number(r.Longitude), message: str(r.Message) }))
    .filter((r) => r.message && Number.isFinite(r.lat) && Number.isFinite(r.lng))
    .map((r) => ({ ...r, at: incidentTime(r.message, now) }));
}

/* ---------------- Faulty traffic lights (v2, SVY21) ---------------- */

export interface LtaFaultyLightRow {
  AlarmID?: string;
  NodeID?: string;
  Type?: number | string;
  StartDate?: string;
  EndDate?: string;
  Message?: string;
  XCoordinate?: number | string;
  YCoordinate?: number | string;
}

export function normaliseFaultyLights(rows: LtaFaultyLightRow[]): FaultyLight[] {
  const out: FaultyLight[] = [];
  for (const r of rows) {
    const x = Number(r.XCoordinate);
    const y = Number(r.YCoordinate);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) continue;
    const { lat, lng } = svy21ToWgs84(y, x);
    const t = Number(r.Type);
    out.push({
      id: str(r.AlarmID) || str(r.NodeID),
      kind: t === 2 ? 'blackout' : t === 13 ? 'flashing-yellow' : 'other',
      lat,
      lng,
      message: str(r.Message),
      startedAt: str(r.StartDate) || null,
    });
  }
  return out;
}

/* ---------------- Estimated travel times ---------------- */

export interface LtaTravelRow {
  Name?: string;
  Direction?: number | string;
  FarEndPoint?: string;
  StartPoint?: string;
  EndPoint?: string;
  EstTime?: number | string;
}

/** Sum the segments of each expressway direction (LTA lists segments in no fixed order). */
export function normaliseTravelTimes(rows: LtaTravelRow[]): { expressways: ExpresswayTime[]; checkpoints: CheckpointTime[] } {
  const acc = new Map<string, ExpresswayTime>();
  for (const r of rows) {
    const name = str(r.Name);
    const dir = Number(r.Direction);
    const mins = Number(r.EstTime);
    if (!name || !Number.isFinite(dir) || !Number.isFinite(mins)) continue;
    const key = `${name}|${dir}`;
    const e = acc.get(key) ?? { expressway: name, direction: dir, towards: str(r.FarEndPoint), minutes: 0 };
    e.minutes += Math.max(0, mins);
    acc.set(key, e);
  }
  const expressways = [...acc.values()].sort((a, b) => a.expressway.localeCompare(b.expressway) || a.direction - b.direction);
  const checkpoints: CheckpointTime[] = [];
  const bke = expressways.find((e) => e.expressway === 'BKE' && /WOODLANDS/i.test(e.towards));
  if (bke) checkpoints.push({ checkpoint: 'Woodlands', via: 'BKE', minutes: bke.minutes });
  const aye = expressways.find((e) => e.expressway === 'AYE' && /TUAS/i.test(e.towards));
  if (aye) checkpoints.push({ checkpoint: 'Tuas', via: 'AYE', minutes: aye.minutes });
  return { expressways, checkpoints };
}

/* ---------------- PUB flood alerts ---------------- */

export interface LtaFloodRow {
  alertId?: string;
  dateTime?: string;
  msgType?: string;
  severity?: string;
  expires?: string;
  headline?: string;
  description?: string;
  instruction?: string;
  areaDesc?: string;
  circle?: string;
  status?: string;
}

/** Active alerts: "Alert" messages without a later "Cancel" for the same id or area, and not expired. */
export function normaliseFloods(rows: LtaFloodRow[], now: Date): FloodAlert[] {
  const sorted = [...rows].sort((a, b) => Date.parse(str(a.dateTime)) - Date.parse(str(b.dateTime)));
  const active = new Map<string, FloodAlert>();
  for (const r of sorted) {
    const type = str(r.msgType).toLowerCase();
    const area = str(r.areaDesc);
    const id = str(r.alertId) || area;
    if (type === 'cancel') {
      active.delete(id);
      for (const [k, v] of active) if (area && v.area === area) active.delete(k);
      continue;
    }
    if (type !== 'alert' && type !== 'update') continue;
    const [latS, lngS, radS] = str(r.circle).split(/[\s,]+/);
    const expiresAt = str(r.expires) || null;
    if (expiresAt && Date.parse(expiresAt) < now.getTime()) continue;
    active.set(id, {
      id,
      headline: str(r.headline) || 'Flood alert',
      description: str(r.description),
      instruction: str(r.instruction),
      area,
      severity: str(r.severity),
      lat: Number.isFinite(Number(latS)) ? Number(latS) : null,
      lng: Number.isFinite(Number(lngS)) ? Number(lngS) : null,
      radiusKm: Number.isFinite(Number(radS)) ? Number(radS) : null,
      issuedAt: str(r.dateTime) || null,
      expiresAt,
    });
  }
  return [...active.values()];
}
