/**
 * Carparks: build the merged catalogue (daily) and the live availability snapshot (every minute).
 * Pure functions shared by the Worker and the catalogue script. No I/O.
 *
 * Sources:
 *  - data.gov.sg "HDB Carpark Information" CSV (d_23f946fa557947f93a8043bbef41dd09): type, system, free/night
 *    parking, decks, gantry height, SVY21 location.
 *  - data.gov.sg HDB carpark-availability (v1): total lots per lot type.
 *  - LTA DataMall CarParkAvailabilityv2: HDB, URA and LTA (mall) carparks with available lots, every minute.
 *  - URA Data Service Car_Park_Details (optional, needs a URA AccessKey): rate bands and capacity.
 */
import type { AvailabilityResponse, CarparkInfo, CarparkType, FreeParking, ShortTerm, UraBand } from './contract';
import { svy21ToWgs84 } from './svy21';
import { hash, parseCsv, str, titleCase } from './text';

/** HDB "List of car parks within Central Area" (hdb.gov.sg short-term parking charges, checked 27 Oct 2026). */
export const HDB_CENTRAL = new Set(['ACB', 'BBB', 'BRB1', 'CY', 'DUXM', 'HLM', 'KAB', 'KAM', 'KAS', 'PRM', 'SLS', 'SR1', 'SR2', 'TPM', 'UCS', 'WCB']);

/** Rough central zone used for URA carparks when URA's own rates aren't available (west, south, east, north). */
export const URA_CENTRAL_BBOX = [103.824, 1.268, 103.867, 1.31] as const;

export interface LtaCarparkRow {
  CarParkID?: string;
  Area?: string;
  Development?: string;
  Location?: string;
  AvailableLots?: number | string;
  LotType?: string;
  Agency?: string;
}

export interface HdbAvailabilityPayload {
  items?: Array<{
    timestamp?: string;
    carpark_data?: Array<{ carpark_number?: string; carpark_info?: Array<{ lot_type?: string; total_lots?: string | number; lots_available?: string | number }> }>;
  }>;
}

export interface UraDetailsRow {
  ppCode?: string;
  ppName?: string;
  vehCat?: string;
  startTime?: string;
  endTime?: string;
  weekdayRate?: string;
  weekdayMin?: string;
  satdayRate?: string;
  satdayMin?: string;
  sunPHRate?: string;
  sunPHMin?: string;
  parkingSystem?: string;
  parkCapacity?: number | string;
  geometries?: Array<{ coordinates?: string }>;
}

const TYPE: Record<string, CarparkType> = {
  'MULTI-STOREY CAR PARK': 'multi-storey',
  'SURFACE CAR PARK': 'surface',
  'BASEMENT CAR PARK': 'basement',
  'SURFACE/MULTI-STOREY CAR PARK': 'surface-multi',
  'COVERED CAR PARK': 'covered',
  'MECHANISED AND SURFACE CAR PARK': 'mechanised',
  'MECHANISED CAR PARK': 'mechanised',
};

const SHORT_TERM: Record<string, ShortTerm> = { 'WHOLE DAY': 'whole-day', '7AM-10.30PM': '7am-10.30pm', '7AM-7PM': '7am-7pm', NO: 'no' };

/** "SUN & PH FR 7AM-10.30PM" → 'sun-ph-7am'; "NO" → undefined. Unknown wording → undefined (never guess "free"). */
export function parseFreeParking(v: string): FreeParking | undefined {
  const s = str(v).toUpperCase();
  if (/SUN\s*&\s*PH/.test(s) && /7\s*AM/.test(s)) return 'sun-ph-7am';
  if (/SUN\s*&\s*PH/.test(s) && /1\s*PM/.test(s)) return 'sun-ph-1pm';
  return undefined;
}

/** Covered = protected from rain (multi-storey, basement, covered, mechanised). */
export function isCovered(c: Pick<CarparkInfo, 'type' | 'basement'>): boolean {
  return c.basement === true || c.type === 'multi-storey' || c.type === 'basement' || c.type === 'covered' || c.type === 'mechanised';
}

function parseLocation(loc: string | undefined): { lat: number; lng: number } | null {
  const [a, b] = str(loc).split(/\s+/).map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const lat = a!;
  const lng = b!;
  if (lat < 1.1 || lat > 1.5 || lng < 103.5 || lng > 104.1) return null;
  return { lat, lng };
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function inUraCentral(lat: number, lng: number): boolean {
  const [w, s, e, n] = URA_CENTRAL_BBOX;
  return lng >= w && lng <= e && lat >= s && lat <= n;
}

/** "08.30 AM" → "0830"; "12.00 AM" → "0000"; "11.59 PM" → "2359". */
export function parseUraTime(v: string | undefined): string | null {
  const m = /^(\d{1,2})[.:](\d{2})\s*(AM|PM)$/i.exec(str(v));
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3]!.toUpperCase() === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}${m[2]}`;
}

const money = (v: string | undefined): number | null => {
  const m = /([\d.]+)/.exec(str(v));
  return m ? Number(m[1]) : null;
};
const minutes = (v: string | undefined): number => Number(/(\d+)/.exec(str(v))?.[1] ?? 30) || 30;

export function uraBands(rows: UraDetailsRow[]): Map<string, { bands: UraBand[]; capacity: Partial<Record<'C' | 'Y', number>>; system?: 'electronic' | 'coupon'; at?: { lat: number; lng: number } }> {
  const out = new Map<string, { bands: UraBand[]; capacity: Partial<Record<'C' | 'Y', number>>; system?: 'electronic' | 'coupon'; at?: { lat: number; lng: number } }>();
  for (const r of rows) {
    const code = str(r.ppCode);
    const cat = str(r.vehCat).toLowerCase();
    const veh = cat.startsWith('car') ? 'C' : cat.startsWith('motor') ? 'M' : null;
    if (!code || !veh) continue;
    const e = out.get(code) ?? { bands: [], capacity: {} };
    const start = parseUraTime(r.startTime);
    const end = parseUraTime(r.endTime);
    if (start && end) {
      e.bands.push({
        veh,
        start,
        end,
        weekday: money(r.weekdayRate),
        saturday: money(r.satdayRate),
        sundayPH: money(r.sunPHRate),
        unitMin: minutes(r.weekdayMin),
      });
    }
    const cap = Number(r.parkCapacity);
    if (Number.isFinite(cap) && cap > 0) e.capacity[veh === 'C' ? 'C' : 'Y'] = cap;
    if (r.parkingSystem === 'B') e.system = 'electronic';
    else if (r.parkingSystem === 'C') e.system = 'coupon';
    const xy = str(r.geometries?.[0]?.coordinates).split(',').map(Number);
    if (!e.at && xy.length === 2 && xy.every(Number.isFinite)) e.at = svy21ToWgs84(xy[1]!, xy[0]!);
    out.set(code, e);
  }
  return out;
}

export interface CatalogInput {
  hdbCsv: string | null;
  hdbAvailability: HdbAvailabilityPayload | null;
  ltaRows: LtaCarparkRow[] | null;
  uraRows: UraDetailsRow[] | null;
}

export function buildCatalog({ hdbCsv, hdbAvailability, ltaRows, uraRows }: CatalogInput): { version: string; carparks: CarparkInfo[] } {
  const byId = new Map<string, CarparkInfo>();

  // 1. HDB static details.
  for (const r of hdbCsv ? parseCsv(hdbCsv) : []) {
    const code = str(r.car_park_no);
    const x = Number(r.x_coord);
    const y = Number(r.y_coord);
    if (!code || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    const { lat, lng } = svy21ToWgs84(y, x);
    const height = Number(r.gantry_height);
    const decks = Number(r.car_park_decks);
    const c: CarparkInfo = {
      id: `HDB:${code}`,
      agency: 'HDB',
      code,
      name: titleCase(str(r.address)),
      lat: round6(lat),
      lng: round6(lng),
    };
    const type = TYPE[str(r.car_park_type).toUpperCase()];
    if (type) c.type = type;
    const sys = str(r.type_of_parking_system).toUpperCase();
    if (sys.startsWith('ELECTRONIC')) c.system = 'electronic';
    else if (sys.startsWith('COUPON')) c.system = 'coupon';
    const st = SHORT_TERM[str(r.short_term_parking).toUpperCase()];
    if (st) c.shortTerm = st;
    const fp = parseFreeParking(r.free_parking ?? '');
    if (fp) c.freeParking = fp;
    c.night = str(r.night_parking).toUpperCase() === 'YES';
    if (Number.isFinite(decks) && decks > 0) c.decks = decks;
    // 0 = not published (surface lots), 9.99 = no limit.
    if (Number.isFinite(height) && height > 0 && height < 9) c.heightM = height;
    if (str(r.car_park_basement).toUpperCase() === 'Y') c.basement = true;
    if (HDB_CENTRAL.has(code)) c.central = true;
    byId.set(c.id, c);
  }

  // 2. HDB totals.
  for (const cp of hdbAvailability?.items?.[0]?.carpark_data ?? []) {
    const c = byId.get(`HDB:${str(cp.carpark_number)}`);
    if (!c) continue;
    for (const info of cp.carpark_info ?? []) {
      const t = str(info.lot_type).toUpperCase();
      const total = Number(info.total_lots);
      if ((t === 'C' || t === 'Y') && Number.isFinite(total) && total > 0) {
        c.totals = { ...c.totals, [t]: (c.totals?.[t] ?? 0) + total };
      }
    }
  }

  // 3. LTA DataMall list: live flags for HDB, plus URA and LTA (mall) carparks.
  for (const r of ltaRows ?? []) {
    const agency = str(r.Agency).toUpperCase();
    const code = str(r.CarParkID);
    if (!code || (agency !== 'HDB' && agency !== 'URA' && agency !== 'LTA')) continue;
    const id = `${agency}:${code}`;
    const existing = byId.get(id);
    if (existing) {
      existing.live = true;
      continue;
    }
    const at = parseLocation(r.Location);
    if (!at) continue;
    const c: CarparkInfo = {
      id,
      agency,
      code,
      name: titleCase(str(r.Development)) || `${agency} carpark ${code}`,
      lat: round6(at.lat),
      lng: round6(at.lng),
      live: true,
    };
    const area = str(r.Area);
    if (agency === 'LTA' && area) c.area = area === 'JurongLakeDistrict' ? 'Jurong Lake District' : area === 'Harbfront' ? 'HarbourFront' : area;
    if (agency === 'URA' && inUraCentral(at.lat, at.lng)) c.central = true;
    byId.set(id, c);
  }

  // 4. URA rates and capacity (optional).
  if (uraRows?.length) {
    for (const [code, e] of uraBands(uraRows)) {
      const c = byId.get(`URA:${code}`);
      if (!c) continue;
      if (e.bands.length) c.ura = e.bands;
      if (Object.keys(e.capacity).length) c.totals = { ...c.totals, ...e.capacity };
      if (e.system) c.system = e.system;
    }
  }

  const carparks = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  const version = hash(carparks.map((c) => `${c.id}|${c.name}|${c.lat}|${c.lng}|${c.totals?.C ?? ''}|${c.ura?.length ?? 0}`).join(';'));
  return { version, carparks };
}

/** DataMall rows → { id: [free car, free motorcycle] } (-1 = not reported). Multiple rows of one type are summed. */
export function normaliseAvailability(rows: LtaCarparkRow[]): AvailabilityResponse['lots'] {
  const lots: AvailabilityResponse['lots'] = {};
  for (const r of rows) {
    const agency = str(r.Agency).toUpperCase();
    const code = str(r.CarParkID);
    const t = str(r.LotType).toUpperCase();
    const n = Number(r.AvailableLots);
    if (!code || !agency || (t !== 'C' && t !== 'Y') || !Number.isFinite(n)) continue;
    const id = `${agency}:${code}`;
    const cur = lots[id] ?? [-1, -1];
    const i = t === 'C' ? 0 : 1;
    cur[i] = Math.max(0, cur[i]) + Math.max(0, n);
    lots[id] = cur;
  }
  return lots;
}
