/**
 * LTA DataMall EVCBatch file → EV charging sites. Pure; runs on the phone (the 3 MB file is passed through
 * by the Worker unparsed, to stay inside the free plan's CPU limit) and in tests.
 *
 * Field quirks handled (API guide v6.10 vs the real batch file, checked 27 Oct 2026):
 *  - "longtitude" (sic) in the file; "longitude" accepted too.
 *  - kW is in "powerRating" in the batch file; the guide's per-postal-code API calls it "chargingSpeed".
 *  - numbers arrive as strings; price/priceType can be blank; priceType can be "free".
 *  - connector status: "1" available, "0" occupied, "" not available (out of order / unknown).
 */
import type { EvConnector, EvSite, EvStatus, PlugKind } from './contract';
import { str, titleCase } from './text';

export interface EvRawPlug {
  plugType?: string;
  price?: string | number;
  current?: string;
  powerRating?: string | number;
  chargingSpeed?: string | number;
  priceType?: string;
  evIds?: Array<{ evCpId?: string; id?: string; status?: string | number }>;
}
export interface EvRawPoint {
  status?: string | number;
  operatingHours?: string;
  operationHours?: string;
  operator?: string;
  position?: string;
  name?: string;
  plugTypes?: EvRawPlug[];
}
export interface EvRawLocation {
  address?: string;
  name?: string;
  longtitude?: number | string;
  longitude?: number | string;
  latitude?: number | string;
  postalCode?: string;
  chargingPoints?: EvRawPoint[];
}
/** The batch file, or the per-postal-code sample shape ({ value: { evLocationsData } }). */
export interface EvRawPayload {
  LastUpdatedTime?: string;
  evLocationsData?: EvRawLocation[];
  value?: { LastUpdatedTime?: string; evLocationsData?: EvRawLocation[] };
}

const OPERATORS: Record<string, string> = {
  'SP MOBILITY': 'SP Mobility',
  'COMFORTDELGRO ENGIE': 'ComfortDelGro ENGIE',
  'SHELL SINGAPORE': 'Shell',
  'CHARGE+': 'Charge+',
  'STRIDES YTL': 'Strides YTL',
  'VOLT SINGAPORE': 'Volt',
  'MNL SOLUTIONS': 'MNL Solutions',
  FASTPARKNCHARGE: 'FastParkNCharge',
  NOVOWATT: 'Novowatt',
  'GREAT CHARGE': 'Great Charge',
  'EV MOBILITY': 'EV Mobility',
  'EIGEN ENERGY': 'Eigen Energy',
  'TESLA MOTORS SINGAPORE': 'Tesla',
  'KED ENERGY': 'KED Energy',
  'ST ENGINEERING URBAN SOLUTIONS': 'ST Engineering',
  'CITY ENERGY GO': 'City Energy Go',
  'EVONE CHARGING': 'EVOne',
  'BUSWAYS': 'Busways',
};

/** "CHARGE+ PTE. LTD." → "Charge+"; unknown → title case without the company suffix. */
export function operatorName(raw: string): string {
  const base = str(raw)
    .toUpperCase()
    .replace(/\b(PTE\.?\s*LTD\.?|PRIVATE LIMITED|LIMITED|LTD\.?)\s*$/i, '')
    .replace(/[\s.]+$/, '')
    .trim();
  if (!base) return 'Unknown operator';
  return OPERATORS[base] ?? titleCase(base);
}

export function plugKind(label: string): PlugKind | 'other' {
  const s = str(label).toLowerCase().replace(/\s+/g, '');
  if (s === 'type2' || s === 'iec62196type2') return 'type2';
  if (s === 'combo2' || s === 'ccs2' || s === 'ccs' || s === 'ccstype2') return 'ccs2';
  if (s === 'chademo') return 'chademo';
  return 'other';
}

function connectorStatus(v: unknown): EvStatus {
  const s = str(v);
  if (s === '1') return 'available';
  if (s === '0') return 'in-use';
  return 'out-of-service';
}

function pointStatus(v: unknown): EvStatus {
  const s = str(v);
  if (s === '1') return 'available';
  if (s === '0') return 'in-use';
  return 'out-of-service';
}

const num = (v: unknown): number | null => {
  const n = Number(str(v));
  return str(v) !== '' && Number.isFinite(n) ? n : null;
};

export function normaliseEv(p: EvRawPayload): { updatedAt: string | null; sites: EvSite[] } {
  const locs = p.evLocationsData ?? p.value?.evLocationsData ?? [];
  const sites: EvSite[] = [];
  const seen = new Set<string>();
  for (const l of locs) {
    const lat = num(l.latitude);
    const lng = num(l.longtitude ?? l.longitude);
    if (lat == null || lng == null || lat < 1.1 || lat > 1.5) continue;
    const connectors: EvConnector[] = [];
    for (const cp of l.chargingPoints ?? []) {
      const operator = operatorName(cp.operator ?? '');
      for (const pt of cp.plugTypes ?? []) {
        const label = str(pt.plugType) || 'Unknown plug';
        const priceType = str(pt.priceType).toLowerCase().replace(/^\$\//, '');
        const unit: EvConnector['priceUnit'] = priceType === 'kwh' ? 'kWh' : priceType === 'h' || priceType === 'hr' || priceType === 'hour' ? 'h' : priceType === 'free' ? 'free' : null;
        const priceVal = num(pt.price);
        const base = {
          plug: plugKind(label),
          plugLabel: label,
          current: (str(pt.current).toUpperCase() === 'DC' ? 'DC' : 'AC') as 'AC' | 'DC',
          kw: num(pt.powerRating ?? pt.chargingSpeed),
          price: unit === 'free' ? 0 : priceVal != null && priceVal > 0 ? Math.round(priceVal * 100) / 100 : null,
          priceUnit: unit === 'free' ? ('free' as const) : priceVal != null && priceVal > 0 ? unit : null,
          position: str(cp.position),
          operator,
        };
        const ids = pt.evIds ?? [];
        if (ids.length === 0) {
          connectors.push({ ...base, id: `${str(cp.position)}-${label}`, status: pointStatus(cp.status) });
        } else {
          for (const e of ids) connectors.push({ ...base, id: str(e.evCpId ?? e.id) || `${str(cp.position)}-${label}`, status: connectorStatus(e.status) });
        }
      }
    }
    if (!connectors.length) continue;
    const postal = str(l.postalCode);
    const id = `${postal || 'x'}-${lat.toFixed(5)}-${lng.toFixed(5)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    sites.push({
      id,
      name: titleCase(str(l.name)) || titleCase(str(l.address)),
      address: titleCase(str(l.address).replace(/\s+SINGAPORE\s+\d{6}$/i, '')),
      postal,
      lat,
      lng,
      operators: [...new Set(connectors.map((c) => c.operator))],
      connectors,
    });
  }
  return { updatedAt: sgtIso(str(p.LastUpdatedTime ?? p.value?.LastUpdatedTime)), sites };
}

/** "2026-10-27 07:20:00" (Singapore time) → "2026-10-27T07:20:00+08:00". */
export function sgtIso(v: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/.exec(v);
  if (!m) return null;
  return `${m[1]}T${m[2]!.length === 5 ? `${m[2]}:00` : m[2]}+08:00`;
}
