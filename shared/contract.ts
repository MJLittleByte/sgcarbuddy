/**
 * SG Car Buddy — /v1 wire contract shared by `worker/` (producer) and `mobile/` (consumer).
 *
 * TYPES ONLY. Both sides import this with `import type`, so nothing here is bundled.
 * Any breaking change needs a new /v2 path, not an edit here.
 */

export interface Freshness {
  /** Worker clock when this response was produced (ISO). */
  serverTime: string;
  /** When the upstream data was fetched (ISO). */
  fetchedAt: string;
  /** true when upstream failed and the Worker returned its last good copy. */
  stale: boolean;
}

export interface ApiErrorBody {
  error: {
    code: 'bad_request' | 'not_found' | 'rate_limited' | 'not_configured' | 'upstream_unavailable' | 'internal';
    message: string;
  };
}

/* ---------------- Carparks ---------------- */

export type Agency = 'HDB' | 'URA' | 'LTA';
/** C = car, Y = motorcycle. Heavy-vehicle (H) and sidecar (S) lots are ignored in v1. */
export type LotType = 'C' | 'Y';
export type CarparkType = 'multi-storey' | 'surface' | 'basement' | 'covered' | 'mechanised' | 'surface-multi';
/** HDB short-term parking window; "no" = season parking only. */
export type ShortTerm = 'whole-day' | '7am-10.30pm' | '7am-7pm' | 'no';
/** HDB Free Parking Scheme on Sundays and public holidays. */
export type FreeParking = 'sun-ph-7am' | 'sun-ph-1pm';

/** URA per-carpark rate band (Car_Park_Details), only when the Worker has a URA key. */
export interface UraBand {
  /** "C" car, "M" motorcycle (URA's codes). */
  veh: 'C' | 'M';
  /** "HHMM" start and end, Singapore time. */
  start: string;
  end: string;
  /** Dollars per `unitMin` minutes; null when URA leaves it blank. */
  weekday: number | null;
  saturday: number | null;
  sundayPH: number | null;
  unitMin: number;
}

export interface CarparkInfo {
  /** `${agency}:${code}` — stable across the catalogue and availability feed. */
  id: string;
  agency: Agency;
  /** The agency's own carpark code, e.g. HDB "CK2", URA "A0007", LTA "23". */
  code: string;
  /** Title-cased name or address, e.g. "Blk 109/117 Teck Whye Lane", "ION Orchard". */
  name: string;
  lat: number;
  lng: number;
  /** LTA area (Orchard, Marina…); malls only. */
  area?: string;
  type?: CarparkType;
  system?: 'electronic' | 'coupon';
  shortTerm?: ShortTerm;
  freeParking?: FreeParking;
  /** HDB Night Parking Scheme ($5 cap). */
  night?: boolean;
  decks?: number;
  /** Gantry height in metres when published (> 0). */
  heightM?: number;
  basement?: boolean;
  /** Total lots when published (HDB via data.gov.sg; URA with a key). */
  totals?: Partial<Record<LotType, number>>;
  /** Inside the HDB Central Area list / URA central zone (higher day rates). */
  central?: boolean;
  /** URA rate bands (only with a URA key). */
  ura?: UraBand[];
  /** Listed in the live availability feed. */
  live?: boolean;
}

export interface CarparkCatalogResponse extends Freshness {
  /** Changes whenever the list changes; clients re-download only when it differs. */
  version: string;
  carparks: CarparkInfo[];
  /** Which optional sources were included (e.g. URA rates need a URA key). */
  sources: { hdbInfo: boolean; hdbTotals: boolean; lta: boolean; uraRates: boolean };
}

export interface AvailabilityResponse extends Freshness {
  /** Carpark id → [free car lots, free motorcycle lots]; -1 when that lot type isn't reported. */
  lots: Record<string, [number, number]>;
}

/* ---------------- EV charging (LTA EVCBatch) ---------------- */

export type PlugKind = 'type2' | 'ccs2' | 'chademo';
export type EvStatus = 'available' | 'in-use' | 'out-of-service';

export interface EvConnector {
  /** LTA evCpId, e.g. "R122901R-001". */
  id: string;
  plug: PlugKind | 'other';
  /** As published, e.g. "Type 2", "Combo 2". */
  plugLabel: string;
  current: 'AC' | 'DC';
  kw: number | null;
  /** Dollars per unit, GST included; null when not published. */
  price: number | null;
  priceUnit: 'kWh' | 'h' | 'free' | null;
  /** Lot / level, e.g. "L3A 128". */
  position: string;
  operator: string;
  status: EvStatus;
}

export interface EvSite {
  id: string;
  name: string;
  address: string;
  postal: string;
  lat: number;
  lng: number;
  operators: string[];
  connectors: EvConnector[];
}

export interface EvResponse extends Freshness {
  /** LTA's own "last updated" for the batch file. */
  updatedAt: string | null;
  sites: EvSite[];
}

/* ---------------- Roads ---------------- */

export type CameraGroup = 'Woodlands' | 'Tuas' | 'Sentosa' | 'Other';

export interface Camera {
  id: string;
  /** From LTA API guide Annex G; "Camera {id}" for unknown ids. */
  name: string;
  /** Short label for compact layouts. */
  short: string;
  group: CameraGroup;
  lat: number;
  lng: number;
  /** Image URL (time-limited for DataMall links; never store it). */
  image: string;
  /** When the picture was taken (ISO), when known. */
  takenAt: string | null;
}

export interface CamerasResponse extends Freshness {
  cameras: Camera[];
  source: 'lta' | 'data.gov.sg';
}

export interface Incident {
  type: string;
  lat: number;
  lng: number;
  /** LTA message, verbatim. */
  message: string;
  /** Parsed from the "(27/10)07:13" prefix, ISO; null if absent. */
  at: string | null;
}

export interface FaultyLight {
  id: string;
  kind: 'blackout' | 'flashing-yellow' | 'other';
  lat: number;
  lng: number;
  message: string;
  startedAt: string | null;
}

export interface ExpresswayTime {
  expressway: string;
  direction: number;
  /** "Towards" end, e.g. "TUAS CHECKPOINT", "WOODLANDS CENTRE". */
  towards: string;
  minutes: number;
}

export interface CheckpointTime {
  checkpoint: 'Woodlands' | 'Tuas';
  via: string;
  /** Whole expressway towards the checkpoint, minutes. */
  minutes: number;
}

export interface FloodAlert {
  id: string;
  headline: string;
  description: string;
  instruction: string;
  area: string;
  severity: string;
  lat: number | null;
  lng: number | null;
  /** PUB broadcast radius (not the flood extent). */
  radiusKm: number | null;
  issuedAt: string | null;
  expiresAt: string | null;
}

export interface RoadsResponse extends Freshness {
  incidents: Incident[];
  faultyLights: FaultyLight[];
  checkpoints: CheckpointTime[];
  expressways: ExpresswayTime[];
  floods: FloodAlert[];
}

/* ---------------- Weather (NEA) ---------------- */

export interface RainArea {
  name: string;
  latitude: number;
  longitude: number;
  /** Verbatim NEA text, e.g. "Thundery Showers". */
  forecast: string;
}

export interface RainGauge {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** mm in the latest 5-minute window (rainfall) or °C (temperature). */
  mm: number;
}

export interface RainForecast {
  updatedAt: string;
  validFrom: string;
  validTo: string;
  /** e.g. "8.00 am to 10.00 am". */
  validText: string;
  areas: RainArea[];
}

export interface StationReadings {
  readingAt: string;
  gauges: RainGauge[];
}

export interface OutlookDay {
  /** "Wednesday". */
  day: string;
  /** "2026-10-28". */
  date: string;
  /** NEA text, e.g. "Thundery Showers". */
  text: string;
  low: number | null;
  high: number | null;
}

export interface WeatherResponse extends Freshness {
  forecast: RainForecast | null;
  rainfall: StationReadings | null;
  /** Air temperature stations; `mm` holds °C. */
  temperature: StationReadings | null;
  outlook: OutlookDay[];
}

export interface RadarFrame {
  /** "yyyyMMddHHmm", Singapore time (NEA's frame name). */
  ts: string;
  /** ISO time of the frame. */
  at: string;
}

export interface RadarResponse extends Freshness {
  /** Oldest first, about every 5 minutes for the last hour. */
  frames: RadarFrame[];
  /** [west, south, east, north] of the 70 km image. */
  bbox: [number, number, number, number];
}

/* ---------------- Places (OneMap) ---------------- */

export interface Place {
  name: string;
  address: string;
  postal: string | null;
  latitude: number;
  longitude: number;
}

export interface PlacesResponse {
  query: string;
  results: Place[];
}

export interface HealthResponse {
  ok: true;
  ltaConfigured: boolean;
  dataGovConfigured: boolean;
  oneMapConfigured: boolean;
  uraConfigured: boolean;
}
