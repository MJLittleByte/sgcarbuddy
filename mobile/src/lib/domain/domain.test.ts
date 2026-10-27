import { describe, expect, it } from 'vitest';
import type { AvailabilityResponse, CarparkInfo, EvSite } from '../../../../shared/contract';
import { evSummary, levelFor, lotsFor } from './availability';
import { duration, timer } from './format';
import { walkMinutes } from './geo';
import { clockHHMM, estimateCost, rateChanges, rateSheet } from './rates';
import { forecastIcon, rainStatus, temperatureAt } from './rain';
import { indexCarparks, searchCarparks } from './search';
import { parkingDay, sgParts } from './time';

/** Singapore wall-clock time → epoch ms. */
const sg = (iso: string) => Date.parse(`${iso}+08:00`);

const hdb = (o: Partial<CarparkInfo> = {}): CarparkInfo => ({
  id: 'HDB:CK7',
  agency: 'HDB',
  code: 'CK7',
  name: 'Blk 135A Teck Whye Lane',
  lat: 1.38,
  lng: 103.75,
  type: 'multi-storey',
  system: 'electronic',
  shortTerm: 'whole-day',
  freeParking: 'sun-ph-7am',
  night: true,
  totals: { C: 298 },
  ...o,
});

describe('time', () => {
  it('reads Singapore wall time and public holidays', () => {
    expect(sgParts(sg('2026-10-27T07:13:00'))).toMatchObject({ date: '2026-10-27', dow: 2, minute: 433, sunPH: false });
    expect(sgParts(sg('2026-11-09T10:00:00'))).toMatchObject({ holiday: true, sunPH: true }); // Deepavali (Observed)
    expect(parkingDay(sg('2026-10-28T06:59:00'))).toBe('2026-10-27');
    expect(parkingDay(sg('2026-10-28T07:00:00'))).toBe('2026-10-28');
  });
});

describe('rates: HDB car', () => {
  const tue10 = sg('2026-10-27T10:00:00');
  it('non-central weekday: $0.60 per 30 min, per minute', () => {
    expect(estimateCost(hdb(), 'car', tue10, 120).amount).toBe(2.4);
    expect(estimateCost(hdb(), 'car', tue10, 45).amount).toBe(0.9);
  });
  it('grace period for electronic parking', () => {
    expect(estimateCost(hdb(), 'car', tue10, 15).amount).toBe(0);
    expect(estimateCost(hdb(), 'car', tue10, 16).amount).toBe(0.32);
  });
  it('coupon parking bills whole half-hours', () => {
    expect(estimateCost(hdb({ system: 'coupon' }), 'car', tue10, 40).amount).toBe(1.2);
  });
  it('Central Area day rate until 5pm, then $0.60', () => {
    const c = hdb({ id: 'HDB:SR1', code: 'SR1', central: true, freeParking: undefined });
    expect(estimateCost(c, 'car', sg('2026-10-27T16:00:00'), 120).amount).toBe(3.6);
    expect(rateSheet(c, 'car').rows[0]).toEqual({ when: 'Mon–Sat daytime', hours: '7am–5pm', price: '$1.20 / 30 min', tone: 'peak' });
  });
  it('Central Area day rate does not apply on Sundays or public holidays', () => {
    const c = hdb({ id: 'HDB:SR1', code: 'SR1', central: true, freeParking: undefined });
    expect(estimateCost(c, 'car', sg('2026-11-01T10:00:00'), 60).amount).toBe(1.2);
    expect(estimateCost(c, 'car', sg('2026-11-09T10:00:00'), 60).amount).toBe(1.2);
  });
  it('Free Parking Scheme on Sunday 7am–10:30pm, charged after', () => {
    const sun = sg('2026-11-01T21:30:00');
    expect(estimateCost(hdb(), 'car', sun, 60).amount).toBe(0);
    expect(estimateCost(hdb(), 'car', sun, 120).amount).toBe(1.2);
    expect(estimateCost(hdb({ freeParking: 'sun-ph-1pm' }), 'car', sg('2026-11-01T11:00:00'), 180).amount).toBe(2.4);
    expect(estimateCost(hdb({ freeParking: undefined }), 'car', sg('2026-11-01T11:00:00'), 60).amount).toBe(1.2);
  });
  it('night cap $5 with the Night Parking Scheme', () => {
    // 10pm to 7am: 30 min at day rate + capped night.
    expect(estimateCost(hdb(), 'car', sg('2026-10-27T22:00:00'), 9 * 60).amount).toBe(0.6 + 5);
  });
  it('without NPS the night is charged in full', () => {
    expect(estimateCost(hdb({ night: false }), 'car', sg('2026-10-27T22:30:00'), 8.5 * 60).amount).toBe(10.2);
  });
  it('whole-day cap $12 (7am–7am)', () => {
    expect(estimateCost(hdb(), 'car', sg('2026-10-27T07:00:00'), 24 * 60).amount).toBe(12);
    expect(estimateCost(hdb({ central: true, freeParking: undefined }), 'car', sg('2026-10-27T07:00:00'), 24 * 60).amount).toBe(20);
  });
  it('peak-hour carparks: $0.80 during peak, no caps', () => {
    const se24 = hdb({ id: 'HDB:SE24', code: 'SE24', freeParking: undefined });
    expect(estimateCost(se24, 'car', sg('2026-10-27T09:00:00'), 120).amount).toBe(2.8);
    expect(estimateCost(se24, 'car', sg('2026-10-27T07:00:00'), 24 * 60).amount).toBeGreaterThan(12);
    const sheet = rateSheet(se24, 'car');
    expect(sheet.rows.some((r) => r.when === 'Peak hours' && r.hours === 'daily 10am–10pm' && r.price === '$0.80 / 30 min')).toBe(true);
    expect(sheet.caps).toEqual([]);
    expect(sheet.tags.map((t) => t.text)).toContain('No daily maximum here');
  });
  it('season-only carparks have no estimate', () => {
    expect(estimateCost(hdb({ shortTerm: 'no' }), 'car', tue10, 60)).toMatchObject({ amount: null, kind: 'none' });
  });
});

describe('rate sheet (plain words for the detail screen)', () => {
  it('HDB car: standard rate, free Sundays, night and day maximums, grace period', () => {
    const s = rateSheet(hdb(), 'car');
    expect(s.rows).toEqual([
      { when: 'Standard rate', price: '$0.60 / 30 min', tone: 'plain' },
      { when: 'Sundays & public holidays', hours: '7am–10:30pm', price: 'Free', tone: 'free' },
    ]);
    expect(s.caps.map((c) => `${c.when} ${c.hours}: ${c.price}`)).toEqual(['Overnight 10:30pm–7am: $5 max', 'Whole day 7am–7am: $12 max']);
    expect(s.tags[0]).toEqual({ text: 'First 15 min free', tone: 'good' });
  });
  it('HDB motorcycle: flat $0.65 per day or night, no "per lot" jargon', () => {
    const s = rateSheet(hdb(), 'motorcycle');
    expect(s.rows.map((r) => `${r.when} ${r.hours}: ${r.price}`)).toEqual(['Day 7am–10:30pm: $0.65', 'Night 10:30pm–7am: $0.65']);
    expect(JSON.stringify(s)).not.toMatch(/per lot/);
  });
  it('malls and season-only carparks explain why there is no rate', () => {
    expect(rateSheet({ id: 'LTA:23', agency: 'LTA', code: '23', name: 'ION Orchard', lat: 1.3, lng: 103.83 }, 'car').empty).toMatch(/mall sets its own rates/);
    expect(rateSheet(hdb({ shortTerm: 'no' }), 'car').empty).toMatch(/Season parking only/);
  });
  it('URA bands become a Mon–Fri / Sat / Sun table', () => {
    const ura: CarparkInfo = {
      id: 'URA:A0004',
      agency: 'URA',
      code: 'A0004',
      name: 'Aliwal St',
      lat: 1.3,
      lng: 103.86,
      ura: [{ veh: 'C', start: '0830', end: '1700', weekday: 0.5, saturday: 0.5, sundayPH: 0, unitMin: 30 }],
    };
    expect(rateSheet(ura, 'car').table).toEqual({ unit: 'Per 30 min', rows: [{ when: '8:30am–5pm', weekday: '$0.50', saturday: '$0.50', sundayPH: 'Free' }] });
    expect([clockHHMM('0000'), clockHHMM('1200'), clockHHMM('2230')]).toEqual(['12am', '12pm', '10:30pm']);
  });
});

describe('rates: other agencies and vehicles', () => {
  it('HDB motorcycle: $0.65 per day window and per night window', () => {
    expect(estimateCost(hdb(), 'motorcycle', sg('2026-10-27T10:00:00'), 120).amount).toBe(0.65);
    expect(estimateCost(hdb(), 'motorcycle', sg('2026-10-27T20:00:00'), 6 * 60).amount).toBe(1.3);
  });
  it('LTA malls: no estimate', () => {
    const mall: CarparkInfo = { id: 'LTA:23', agency: 'LTA', code: '23', name: 'ION Orchard', lat: 1.3, lng: 103.83 };
    expect(estimateCost(mall, 'car', Date.now(), 60)).toMatchObject({ amount: null, kind: 'none' });
  });
  it('URA without the URA feed uses standard coupon rates, labelled typical', () => {
    const ura: CarparkInfo = { id: 'URA:A0007', agency: 'URA', code: 'A0007', name: 'Angullia Park', lat: 1.3, lng: 103.83, central: true };
    const e = estimateCost(ura, 'car', sg('2026-10-27T10:00:00'), 60);
    expect(e).toMatchObject({ amount: 2.4, kind: 'typical' });
    expect(e.note).toMatch(/standard/);
  });
  it('URA with rate bands', () => {
    const ura: CarparkInfo = {
      id: 'URA:A0004',
      agency: 'URA',
      code: 'A0004',
      name: 'Aliwal St',
      lat: 1.3,
      lng: 103.86,
      system: 'coupon',
      ura: [
        { veh: 'C', start: '0830', end: '1700', weekday: 0.5, saturday: 0.5, sundayPH: 0, unitMin: 30 },
        { veh: 'C', start: '1700', end: '0830', weekday: 0.6, saturday: 0.6, sundayPH: 0.6, unitMin: 30 },
      ],
    };
    expect(estimateCost(ura, 'car', sg('2026-10-27T10:00:00'), 60)).toMatchObject({ amount: 1, kind: 'rule' });
    expect(estimateCost(ura, 'car', sg('2026-10-27T16:30:00'), 60).amount).toBe(1.1);
  });
});

describe('rate changes (parked reminders)', () => {
  it('finds when Sunday free parking ends and the night cap starts', () => {
    const ch = rateChanges(hdb(), 'car', sg('2026-11-01T20:00:00'), 4 * 60);
    expect(ch.map((c) => c.kind)).toEqual(['free-ends', 'night-cap']);
    expect(ch[0]!.at).toBe(sg('2026-11-01T22:30:00'));
  });
  it('finds the Central Area 5pm drop', () => {
    const ch = rateChanges(hdb({ central: true, freeParking: undefined }), 'car', sg('2026-10-27T15:00:00'), 3 * 60);
    expect(ch[0]).toMatchObject({ kind: 'down', at: sg('2026-10-27T17:00:00') });
  });
});

describe('availability', () => {
  const now = Date.parse('2026-10-27T00:00:00Z');
  const avail: AvailabilityResponse = { lots: { 'HDB:CK7': [236, 5] }, serverTime: '', fetchedAt: new Date(now - 60_000).toISOString(), stale: false };
  it('levels', () => {
    expect([levelFor(null), levelFor(0), levelFor(3), levelFor(20), levelFor(300)]).toEqual(['none', 'full', 'few', 'limited', 'plenty']);
  });
  it('lots for my vehicle, never from stale data', () => {
    expect(lotsFor(hdb(), 'car', avail, now)).toEqual({ free: 236, total: 298, level: 'plenty', why: 'live' });
    expect(lotsFor(hdb(), 'motorcycle', avail, now)).toMatchObject({ free: 5, level: 'few' });
    expect(lotsFor(hdb(), 'car', avail, now + 20 * 60_000)).toMatchObject({ free: null, level: 'none', why: 'stale' });
    expect(lotsFor(hdb({ id: 'HDB:X' }), 'car', avail, now)).toMatchObject({ level: 'none', why: 'not-listed' });
    expect(lotsFor(hdb(), 'car', null, now).why).toBe('loading');
  });
  it('says when a carpark reports cars but not motorcycles (not "no live data")', () => {
    const carsOnly: AvailabilityResponse = { ...avail, lots: { 'HDB:CK7': [331, -1] } };
    expect(lotsFor(hdb(), 'motorcycle', carsOnly, now)).toMatchObject({ free: null, why: 'not-reported' });
    expect(lotsFor(hdb(), 'car', carsOnly, now)).toMatchObject({ free: 298, why: 'live' });
  });
  it('EV summary for my plugs', () => {
    const site: EvSite = {
      id: 's',
      name: 'S',
      address: '',
      postal: '',
      lat: 1.3,
      lng: 103.8,
      operators: ['Charge+'],
      connectors: [
        { id: 'a', plug: 'type2', plugLabel: 'Type 2', current: 'AC', kw: 7.4, price: 0.65, priceUnit: 'kWh', position: '', operator: 'Charge+', status: 'available' },
        { id: 'b', plug: 'type2', plugLabel: 'Type 2', current: 'AC', kw: 7.4, price: 0.65, priceUnit: 'kWh', position: '', operator: 'Charge+', status: 'in-use' },
        { id: 'c', plug: 'ccs2', plugLabel: 'Combo 2', current: 'DC', kw: 50, price: 0.79, priceUnit: 'kWh', position: '', operator: 'Charge+', status: 'out-of-service' },
      ],
    };
    expect(evSummary(site, ['type2'])).toMatchObject({ total: 2, free: 1, inUse: 1, level: 'plenty', maxKw: 7.4, dc: false, price: { amount: 0.65, unit: 'kWh' } });
    expect(evSummary(site, ['ccs2'])).toMatchObject({ total: 1, free: 0, level: 'none', dc: true });
    expect(evSummary(site, ['chademo']).level).toBe('none');
    expect(evSummary(site, 'all').total).toBe(3);
  });
});

describe('search, walking, format, weather', () => {
  const idx = indexCarparks([hdb(), hdb({ id: 'HDB:TW1', code: 'TW1', name: 'Blk 25/26 Teck Whye Lane' }), hdb({ id: 'LTA:23', code: '23', name: 'ION Orchard', agency: 'LTA' })]);
  it('searches names with abbreviations and codes', () => {
    expect(searchCarparks(idx, 'teck whye ln').map((c) => c.code)).toEqual(['CK7', 'TW1']);
    expect(searchCarparks(idx, 'ck7').map((c) => c.code)).toEqual(['CK7']);
    expect(searchCarparks(idx, 'blk 135a')[0]!.code).toBe('CK7');
    expect(searchCarparks(idx, 'ion').map((c) => c.code)).toEqual(['23']);
  });
  it('walk minutes and formats', () => {
    expect(walkMinutes(100)).toBe(2);
    expect(walkMinutes(10)).toBe(1);
    expect(duration(72)).toBe('1 h 12 min');
    expect(timer(72)).toBe('1h 12m');
  });
  it('rain and temperature at a place', () => {
    const now = Date.parse('2026-10-27T00:00:00Z');
    const res = {
      fetchedAt: new Date(now).toISOString(),
      forecast: { updatedAt: '', validFrom: '', validTo: new Date(now + 3600_000).toISOString(), validText: '8.00 am to 10.00 am', areas: [{ name: 'Bishan', latitude: 1.35, longitude: 103.84, forecast: 'Thundery Showers' }] },
      rainfall: { readingAt: new Date(now).toISOString(), gauges: [{ id: 'g', name: 'G', latitude: 1.351, longitude: 103.841, mm: 0.4 }] },
      temperature: { readingAt: '', gauges: [{ id: 't', name: 'T', latitude: 1.35, longitude: 103.84, mm: 28.4 }] },
    };
    expect(rainStatus(res, { lat: 1.35, lng: 103.84 }, now).state).toBe('raining');
    expect(temperatureAt(res, { lat: 1.35, lng: 103.84 })).toBe(28);
    expect(forecastIcon('Thundery Showers')).toBe('storm');
    expect(forecastIcon('Partly Cloudy (Night)')).toBe('moon');
    expect(forecastIcon('Fair (Day)')).toBe('sun');
  });
});

import { activeParkFilterCount, chargersNear, evRows, parkingRows } from './lists';
import { DEFAULT_EV_FILTERS, DEFAULT_PARK_FILTERS } from '../storage/store';

describe('lists', () => {
  const at = { lat: 1.38, lng: 103.75 };
  const now = sg('2026-10-27T10:00:00');
  const near = (o: Partial<CarparkInfo>) => hdb({ ...o });
  const carparks = [
    near({ id: 'HDB:A', code: 'A', lat: 1.3802, lng: 103.75, totals: { C: 100 } }),
    near({ id: 'HDB:B', code: 'B', lat: 1.381, lng: 103.75, totals: { C: 100 }, type: 'surface' }),
    near({ id: 'HDB:C', code: 'C', lat: 1.3801, lng: 103.75, shortTerm: 'no' }),
    near({ id: 'HDB:FAR', code: 'FAR', lat: 1.4, lng: 103.75 }),
  ];
  const avail: AvailabilityResponse = { lots: { 'HDB:A': [0, -1], 'HDB:B': [50, -1], 'HDB:C': [10, -1] }, serverTime: '', fetchedAt: new Date(now).toISOString(), stale: false };
  const base = { carparks, at, vehicle: 'car' as const, avail, now, stayMin: 60, filters: DEFAULT_PARK_FILTERS, sort: 'nearest' as const, pace: 75 };
  it('hides season-only by default and far carparks', () => {
    const r = parkingRows(base);
    // A is a 1-minute walk (full), B a 2-minute walk: walking time comes first.
    expect(r.rows.map((x) => x.cp.code)).toEqual(['A', 'B']);
    expect(r.hidden).toBe(1);
  });
  it('full carparks sort after ones with space in the same walking minute', () => {
    const r = parkingRows({ ...base, carparks: carparks.slice(0, 2).map((c) => ({ ...c, lat: 1.3802 })) });
    expect(r.rows[0]!.cp.code).toBe('B');
  });
  it('filters by covered and space; sorts by most space', () => {
    expect(parkingRows({ ...base, filters: { ...DEFAULT_PARK_FILTERS, covered: true } }).rows.map((x) => x.cp.code)).toEqual(['A']);
    expect(parkingRows({ ...base, filters: { ...DEFAULT_PARK_FILTERS, hasSpace: true } }).rows.map((x) => x.cp.code)).toEqual(['B']);
    expect(parkingRows({ ...base, sort: 'space' }).rows[0]!.cp.code).toBe('B');
    expect(activeParkFilterCount({ ...DEFAULT_PARK_FILTERS, covered: true, hideSeasonOnly: false })).toBe(2);
  });
  it('EV rows for my plugs, nearby match to carparks', () => {
    const site: EvSite = {
      id: 's1',
      name: 'S',
      address: '',
      postal: '',
      lat: 1.38021,
      lng: 103.75,
      operators: ['Charge+'],
      connectors: [{ id: 'a', plug: 'type2', plugLabel: 'Type 2', current: 'AC', kw: 7.4, price: 0.65, priceUnit: 'kWh', position: '', operator: 'Charge+', status: 'available' }],
    };
    expect(evRows([site], at, ['type2'], DEFAULT_EV_FILTERS, 75).rows).toHaveLength(1);
    expect(evRows([site], at, ['ccs2'], DEFAULT_EV_FILTERS, 75).rows).toHaveLength(0);
    expect(chargersNear(carparks[0]!, [site]).map((s) => s.id)).toEqual(['s1']);
    expect(chargersNear(carparks[3]!, [site])).toEqual([]);
  });
});
