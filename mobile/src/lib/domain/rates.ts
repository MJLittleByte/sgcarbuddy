/**
 * Parking cost estimator (plan §11.3). Only official, published rules; anything else is "none".
 * Pure and unit-tested. Amounts are estimates: the app always labels them "est." and shows the basis.
 *
 * HDB (hdb.gov.sg short-term parking charges, checked 27 Oct 2026):
 *  - Car $0.60 / 30 min; Central Area $1.20 / 30 min Mon–Sat 7am–5pm, $0.60 other hours.
 *  - Peak-hour pricing at 12 carparks: $0.80 / 30 min ($1.40 in Central Area day hours); no caps there.
 *  - Night Parking Scheme: $5 cap per night (10:30pm–7am); whole day (7am–7am) cap $12 / $20 Central.
 *    Without NPS: day (7am–10:30pm) cap $12 / $20.
 *  - Free Parking Scheme: Sundays & public holidays 7am (or 1pm) – 10:30pm where listed.
 *  - Electronic: per minute, 15-minute grace. Coupon: whole half-hours.
 *  - Motorcycle $0.65 per lot for the day (7am–10:30pm) and $0.65 for the night.
 * URA: per-carpark bands when the Worker has a URA key; otherwise URA's standard coupon rates ("typical").
 * LTA (malls): no official rates published → none.
 */
import type { CarparkInfo, UraBand } from '../../../../shared/contract';
import { hhmm, parkingDay, PUBLIC_HOLIDAYS, sgClock, sgParts, type SgParts } from './time';

export type Vehicle = 'car' | 'ev' | 'motorcycle';

export interface CostEstimate {
  /** Dollars, or null when no official rate is known. */
  amount: number | null;
  /** rule = official per-carpark rule; typical = standard agency rate; none = unknown. */
  kind: 'rule' | 'typical' | 'none';
  /** Human-readable basis lines, e.g. "$0.60 per 30 min", "Capped at $5 per night". */
  basis: string[];
  note?: string;
}

export const money = (n: number): string => (n === 0 ? 'Free' : `$${n.toFixed(2)}`);

const NIGHT_START = 22 * 60 + 30;
const DAY_START = 7 * 60;
const CENTRAL_END = 17 * 60;
const GRACE_MIN = 15;

type Window = (p: SgParts) => boolean;
const wkend = (p: SgParts) => p.dow === 0 || p.dow === 6 || p.holiday;
const between = (p: SgParts, from: number, to: number) => p.minute >= from && p.minute < to;
const H = (h: number, m = 0) => h * 60 + m;

/** HDB peak-hour pricing car parks and their peak periods. Public holidays are treated as weekends (not stated by HDB). */
export const HDB_PEAK: Readonly<Record<string, { win: Window; text: string }>> = (() => {
  const accy = { win: (p: SgParts) => (wkend(p) ? between(p, H(8), H(19)) : between(p, H(10), H(18))), text: 'weekdays 10am–6pm, weekends 8am–7pm' };
  const se = { win: (p: SgParts) => p.dow >= 1 && p.dow <= 6 && between(p, H(10), H(22)), text: 'Mon–Sat 10am–10pm' };
  const se24 = { win: (p: SgParts) => between(p, H(10), H(22)), text: 'daily 10am–10pm' };
  const mp = { win: (p: SgParts) => between(p, H(8), H(20)), text: 'daily 8am–8pm' };
  const hg = { win: (p: SgParts) => (wkend(p) ? between(p, H(9), H(20)) : between(p, H(11), H(20))), text: 'weekdays 11am–8pm, weekends 9am–8pm' };
  return { ACB: accy, CY: accy, SE21: se, SE22: se, SE24: se24, MP14: mp, MP15: mp, MP16: mp, HG9: hg, HG9T: hg, HG15: hg, HG16: hg };
})();

interface MinuteRate {
  perMin: number;
  free: boolean;
  night: boolean;
  /** Short description used for basis lines and reminders. */
  label: string;
  /** Dollars per 30 minutes (for display). */
  half: number;
}

const isNight = (p: SgParts) => p.minute >= NIGHT_START || p.minute < DAY_START;
const isHdbPeakCarpark = (cp: CarparkInfo) => cp.agency === 'HDB' && cp.code in HDB_PEAK;

function freeWindow(cp: CarparkInfo, p: SgParts): boolean {
  if (!cp.freeParking || !p.sunPH) return false;
  const from = cp.freeParking === 'sun-ph-7am' ? DAY_START : H(13);
  return p.minute >= from && p.minute < NIGHT_START;
}

/** Standard HDB / URA car rate at one minute (URA uses the same standard coupon structure). */
function standardCarRate(cp: CarparkInfo, p: SgParts): MinuteRate {
  const night = isNight(p);
  if (cp.agency === 'HDB' && freeWindow(cp, p)) return { perMin: 0, half: 0, free: true, night, label: 'Free (Sundays & public holidays)' };
  const centralDay = Boolean(cp.central) && p.dow >= 1 && p.dow <= 6 && !p.holiday && p.minute >= DAY_START && p.minute < CENTRAL_END;
  const peak = cp.agency === 'HDB' && (HDB_PEAK[cp.code]?.win(p) ?? false);
  const half = peak ? (centralDay ? 1.4 : 0.8) : centralDay ? 1.2 : 0.6;
  return { perMin: half / 30, half, free: false, night, label: `${money(half)} per 30 min${peak ? ' (peak hours)' : ''}` };
}

function bandFor(bands: UraBand[], p: SgParts): UraBand | null {
  for (const b of bands) {
    const s = hhmm(b.start);
    let e = hhmm(b.end);
    if (e === 0 || b.end === '2359') e = 24 * 60;
    const inside = s <= e ? p.minute >= s && p.minute < e : p.minute >= s || p.minute < e;
    if (inside) return b;
  }
  return null;
}

function uraBandRate(bands: UraBand[], p: SgParts): MinuteRate | null {
  const b = bandFor(bands, p);
  if (!b) return null;
  const v = p.sunPH ? b.sundayPH : p.dow === 6 ? b.saturday : b.weekday;
  if (v == null) return null;
  const half = (v / b.unitMin) * 30;
  return { perMin: v / b.unitMin, half, free: v === 0, night: isNight(p), label: v === 0 ? 'Free' : `${money(v)} per ${b.unitMin} min` };
}

/** The rate in force at one moment, or null when unknown. Exposed for the detail screen and reminders. */
export function rateAt(cp: CarparkInfo, vehicle: Vehicle, t: number, holidays = PUBLIC_HOLIDAYS): MinuteRate | null {
  if (vehicle === 'motorcycle') return null;
  const p = sgParts(t, holidays);
  if (cp.agency === 'HDB') return standardCarRate(cp, p);
  if (cp.agency === 'URA') {
    const bands = cp.ura?.filter((b) => b.veh === 'C');
    return bands?.length ? uraBandRate(bands, p) : standardCarRate(cp, p);
  }
  return null;
}

const round2 = (n: number) => Math.round(n * 100 + 1e-9) / 100;

export function estimateCost(cp: CarparkInfo, vehicle: Vehicle, start: number, durationMin: number, holidays = PUBLIC_HOLIDAYS): CostEstimate {
  const dur = Math.max(0, Math.round(durationMin));
  if (cp.agency === 'LTA') return { amount: null, kind: 'none', basis: [], note: 'Rates vary by mall. Check the signs at the entrance.' };
  if (cp.agency === 'HDB' && cp.shortTerm === 'no') return { amount: null, kind: 'none', basis: [], note: 'Season parking only: no short-term parking here.' };

  if (vehicle === 'motorcycle') {
    if (cp.agency !== 'HDB') {
      const bands = cp.ura?.filter((b) => b.veh === 'M');
      if (!bands?.length) return { amount: null, kind: 'none', basis: [], note: 'Motorcycle rate not published for this carpark.' };
      return perMinute(cp, start, dur, holidays, (p) => uraBandRate(bands, p), false);
    }
    // $0.65 per lot for each day (7am–10:30pm) and each night (10:30pm–7am) window the stay touches.
    const windows = new Set<string>();
    for (let i = 0; i < Math.max(1, dur); i += 5) {
      const t = start + i * 60_000;
      windows.add(`${parkingDay(t)}:${isNight(sgParts(t, holidays)) ? 'n' : 'd'}`);
    }
    return { amount: round2(windows.size * 0.65), kind: 'rule', basis: ['$0.65 per lot for the day (7am–10:30pm)', '$0.65 per lot for the night (10:30pm–7am)'] };
  }

  const uraBands = cp.agency === 'URA' ? cp.ura?.filter((b) => b.veh === 'C') : undefined;
  if (uraBands?.length) return perMinute(cp, start, dur, holidays, (p) => uraBandRate(uraBands, p), false);
  return perMinute(cp, start, dur, holidays, (p) => standardCarRate(cp, p), !isHdbPeakCarpark(cp));
}

function perMinute(
  cp: CarparkInfo,
  start: number,
  dur: number,
  holidays: Readonly<Record<string, string>>,
  rate: (p: SgParts) => MinuteRate | null,
  withCaps: boolean,
): CostEstimate {
  const typical = cp.agency === 'URA' && !cp.ura?.length;
  const kind: CostEstimate['kind'] = typical ? 'typical' : 'rule';
  const basis: string[] = [];
  const add = (s: string) => !basis.includes(s) && basis.push(s);

  if (cp.system === 'electronic' && dur <= GRACE_MIN) {
    return { amount: 0, kind, basis: ['Free within the 15-minute grace period'] };
  }
  // Coupon parking is paid in whole half-hours.
  const billed = cp.system === 'coupon' ? Math.ceil(dur / 30) * 30 : dur;
  const days = new Map<string, { day: number; night: number }>();
  let unknown = false;
  for (let i = 0; i < billed; i++) {
    const t = start + i * 60_000;
    const r = rate(sgParts(t, holidays));
    if (!r) {
      unknown = true;
      continue;
    }
    add(r.label);
    if (r.free) continue;
    const k = parkingDay(t);
    const e = days.get(k) ?? { day: 0, night: 0 };
    if (r.night) e.night += r.perMin;
    else e.day += r.perMin;
    days.set(k, e);
  }
  if (unknown && days.size === 0) return { amount: null, kind: 'none', basis: [], note: 'No published rate for this time.' };

  const cap = cp.central ? 20 : 12;
  // URA's standard coupon scheme has the same $5 night coupon and day caps as HDB's Night Parking Scheme.
  const nps = cp.agency === 'URA' ? true : Boolean(cp.night);
  let total = 0;
  for (const { day, night } of days.values()) {
    if (!withCaps) {
      total += day + night;
    } else if (nps) {
      const n = Math.min(night, 5);
      if (night > 5) add('Capped at $5 per night (10:30pm–7am)');
      if (day + n > cap) add(`Capped at $${cap} per day (7am–7am)`);
      total += Math.min(day + n, cap);
    } else {
      if (day > cap) add(`Capped at $${cap} per day (7am–10:30pm)`);
      total += Math.min(day, cap) + night;
    }
  }
  if (cp.system === 'electronic') add('Charged per minute');
  if (cp.system === 'coupon') add('Coupon parking: whole half-hours');
  const note = typical ? "URA's standard coupon rates. This carpark's own rates may differ." : unknown ? 'Part of your stay has no published rate.' : undefined;
  return { amount: round2(total), kind, basis, ...(note ? { note } : {}) };
}

/* ---------------- Rate sheet (carpark detail "Price" card) ---------------- */

/** free = costs nothing; peak = higher than standard; cap = a maximum charge; plain = standard. */
export type RateTone = 'free' | 'peak' | 'cap' | 'plain';
export interface RateRow {
  /** When it applies, in plain words: "Sundays & public holidays". */
  when: string;
  /** Clock hours, shown under `when`: "7am–10:30pm". */
  hours?: string;
  /** What you pay: "$0.60 / 30 min", "Free", "$5 max". */
  price: string;
  tone: RateTone;
}
export interface RateTag {
  text: string;
  tone: 'good' | 'info' | 'warn';
}
export interface RateSheet {
  /** What you pay, and when. */
  rows: RateRow[];
  /** The most you pay per night / per day. */
  caps: RateRow[];
  /** Short facts worth highlighting (grace period, per-minute charging, visitor hours…). */
  tags: RateTag[];
  /** URA per-carpark bands: time band × Mon–Fri / Sat / Sun & PH. */
  table?: { unit: string; rows: Array<{ when: string; weekday: string; saturday: string; sundayPH: string }> };
  /** Shown instead of rows when no rates are published (malls, season-only). */
  empty?: string;
  source: string;
}

const per30 = (n: number) => `${money(n)} / 30 min`;

/** "0830" → "8:30am", "1700" → "5pm". */
export function clockHHMM(s: string): string {
  const h = Number(s.slice(0, 2));
  const m = s.slice(2, 4);
  const h12 = h % 12 || 12;
  const ap = h < 12 || h === 24 ? 'am' : 'pm';
  return m === '00' ? `${h12}${ap}` : `${h12}:${m}${ap}`;
}

function uraTable(bands: UraBand[]): RateSheet['table'] {
  const units = new Set(bands.map((b) => b.unitMin));
  const one = units.size === 1;
  const cell = (v: number | null, unit: number) => (v == null ? '—' : v === 0 ? 'Free' : one ? money(v) : `${money(v)}/${unit} min`);
  return {
    unit: one ? `Per ${bands[0]!.unitMin} min` : '',
    rows: bands.map((b) => ({
      when: `${clockHHMM(b.start)}–${clockHHMM(b.end)}`,
      weekday: cell(b.weekday, b.unitMin),
      saturday: cell(b.saturday, b.unitMin),
      sundayPH: cell(b.sundayPH, b.unitMin),
    })),
  };
}

function systemTags(cp: CarparkInfo): RateTag[] {
  const tags: RateTag[] = [];
  if (cp.system === 'electronic') tags.push({ text: 'First 15 min free', tone: 'good' }, { text: 'Charged by the minute', tone: 'info' });
  if (cp.system === 'coupon') tags.push({ text: 'Paper coupons, per 30 min', tone: 'info' });
  if (cp.shortTerm === '7am-10.30pm') tags.push({ text: 'Visitors 7am–10:30pm only', tone: 'warn' });
  if (cp.shortTerm === '7am-7pm') tags.push({ text: 'Visitors 7am–7pm only', tone: 'warn' });
  return tags;
}

/** Published rules for one carpark and vehicle, in plain words. */
export function rateSheet(cp: CarparkInfo, vehicle: Vehicle): RateSheet {
  const none = { rows: [], caps: [], tags: [] };
  if (cp.agency === 'LTA') return { ...none, empty: 'Each mall sets its own rates. Check the signs at the entrance.', source: 'LTA publishes live lots for malls, not their rates.' };
  if (cp.agency === 'HDB' && cp.shortTerm === 'no') return { ...none, empty: 'Season parking only: there is no visitor parking here.', source: 'HDB carpark information' };

  if (vehicle === 'motorcycle') {
    if (cp.agency === 'HDB') {
      return {
        rows: [
          { when: 'Day', hours: '7am–10:30pm', price: '$0.65', tone: 'plain' },
          { when: 'Night', hours: '10:30pm–7am', price: '$0.65', tone: 'plain' },
        ],
        caps: [],
        tags: [{ text: 'One flat charge per day or night', tone: 'good' }, ...systemTags(cp).filter((t) => t.tone === 'warn')],
        source: 'HDB short-term parking charges for motorcycles',
      };
    }
    const bands = cp.ura?.filter((b) => b.veh === 'M') ?? [];
    return bands.length
      ? { ...none, table: uraTable(bands), tags: systemTags(cp), source: 'URA carpark rates' }
      : { ...none, empty: 'Motorcycle rates are not published for this carpark.', source: 'URA' };
  }

  const uraBands = cp.agency === 'URA' ? (cp.ura?.filter((b) => b.veh === 'C') ?? []) : [];
  if (uraBands.length) return { ...none, table: uraTable(uraBands), tags: systemTags(cp), source: 'URA carpark rates' };

  const rows: RateRow[] = [];
  const peak = cp.agency === 'HDB' ? HDB_PEAK[cp.code] : undefined;
  if (cp.central) rows.push({ when: 'Mon–Sat daytime', hours: '7am–5pm', price: per30(1.2), tone: 'peak' }, { when: 'All other times', price: per30(0.6), tone: 'plain' });
  else rows.push({ when: cp.freeParking || peak ? 'Standard rate' : 'Any time', price: per30(0.6), tone: 'plain' });
  if (peak) rows.push({ when: 'Peak hours', hours: peak.text, price: cp.central ? `${money(1.4)} / ${money(0.8)} per 30 min` : per30(0.8), tone: 'peak' });
  if (cp.freeParking) rows.push({ when: 'Sundays & public holidays', hours: `${cp.freeParking === 'sun-ph-7am' ? '7am' : '1pm'}–10:30pm`, price: 'Free', tone: 'free' });

  const caps: RateRow[] = [];
  const tags = systemTags(cp);
  const cap = cp.central ? 20 : 12;
  if (peak) tags.push({ text: 'No daily maximum here', tone: 'warn' });
  else if (cp.agency === 'URA' || cp.night) caps.push({ when: 'Overnight', hours: '10:30pm–7am', price: '$5 max', tone: 'cap' }, { when: 'Whole day', hours: '7am–7am', price: `$${cap} max`, tone: 'cap' });
  else caps.push({ when: 'Daytime', hours: '7am–10:30pm', price: `$${cap} max`, tone: 'cap' });

  return {
    rows,
    caps,
    tags,
    source: cp.agency === 'URA' ? "URA's standard coupon rates (no per-carpark rates without a URA key)" : 'HDB short-term parking charges',
  };
}

export interface RateChange {
  at: number;
  kind: 'free-ends' | 'free-starts' | 'up' | 'down' | 'night-cap';
  label: string;
}

/** Upcoming rate changes for a parked car (for reminders), within `horizonMin` of `from`. */
export function rateChanges(cp: CarparkInfo, vehicle: Vehicle, from: number, horizonMin = 24 * 60, holidays = PUBLIC_HOLIDAYS): RateChange[] {
  const out: RateChange[] = [];
  let prev = rateAt(cp, vehicle, from, holidays);
  const nps = cp.agency === 'URA' || Boolean(cp.night);
  for (let i = 1; i <= horizonMin && prev; i++) {
    const t = from + i * 60_000;
    const cur = rateAt(cp, vehicle, t, holidays);
    if (!cur) break;
    if (prev.free && !cur.free) out.push({ at: t, kind: 'free-ends', label: `Free parking ends at ${sgClock(t)}` });
    else if (!prev.free && cur.free) out.push({ at: t, kind: 'free-starts', label: `Free parking from ${sgClock(t)}` });
    else if (cur.half > prev.half) out.push({ at: t, kind: 'up', label: `Rate goes up to ${money(cur.half)} per 30 min at ${sgClock(t)}` });
    else if (cur.half < prev.half) out.push({ at: t, kind: 'down', label: `Rate drops to ${money(cur.half)} per 30 min at ${sgClock(t)}` });
    if (nps && !isHdbPeakCarpark(cp) && !prev.night && cur.night && !cur.free) out.push({ at: t, kind: 'night-cap', label: `Night cap ($5) starts at ${sgClock(t)}` });
    prev = cur;
  }
  return out;
}
