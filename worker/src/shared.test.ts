import { describe, expect, it } from 'vitest';
import { buildCatalog, isCovered, normaliseAvailability, parseFreeParking, parseUraTime, uraBands } from '../../shared/carparks';
import { normaliseEv, operatorName, plugKind, sgtIso } from '../../shared/ev';
import { normaliseForecast, normaliseOutlook, normaliseStations } from '../../shared/nea';
import { normalisePlaces } from '../../shared/onemap';
import {
  incidentTime,
  normaliseDgsCameras,
  normaliseFaultyLights,
  normaliseFloods,
  normaliseIncidents,
  normaliseLtaCameras,
  normaliseTravelTimes,
  takenAtFromLink,
} from '../../shared/roads';
import { svy21ToWgs84 } from '../../shared/svy21';
import { hash, parseCsv, titleCase } from '../../shared/text';

describe('text', () => {
  it('title-cases government ALL CAPS names, keeping block numbers and acronyms', () => {
    expect(titleCase('BLK 109/117 TECK WHYE LANE')).toBe('Blk 109/117 Teck Whye Lane');
    expect(titleCase('BLK 118A TECK WHYE LANE')).toBe('Blk 118A Teck Whye Lane');
    expect(titleCase('ANGULLIA PARK OFF ST')).toBe('Angullia Park Off St');
    expect(titleCase('2 ORCHARD TURN ION ORCHARD')).toBe('2 Orchard Turn ION Orchard');
    expect(titleCase('ION Orchard')).toBe('ION Orchard');
  });
  it('parses quoted CSV fields with commas', () => {
    const rows = parseCsv('a,b,c\r\nX,"BLK 135-138,141 & 145",3\r\n');
    expect(rows).toEqual([{ a: 'X', b: 'BLK 135-138,141 & 145', c: '3' }]);
  });
  it('hash is stable', () => expect(hash('abc')).toBe(hash('abc')));
});

describe('svy21', () => {
  it('converts HDB ACB (Albert Centre) to WGS84 within a few metres', () => {
    const { lat, lng } = svy21ToWgs84(31490.4942, 30314.7936);
    expect(lat).toBeCloseTo(1.301063, 5);
    expect(lng).toBeCloseTo(103.854118, 5);
  });
});

const HDB_CSV = `car_park_no,address,x_coord,y_coord,car_park_type,type_of_parking_system,short_term_parking,free_parking,night_parking,car_park_decks,gantry_height,car_park_basement
ACB,BLK 270/271 ALBERT CENTRE BASEMENT CAR PARK,30314.7936,31490.4942,BASEMENT CAR PARK,ELECTRONIC PARKING,WHOLE DAY,NO,YES,1,1.8,Y
CK7,BLK 135A TECK WHYE LANE,18850.0,41500.0,MULTI-STOREY CAR PARK,ELECTRONIC PARKING,WHOLE DAY,SUN & PH FR 7AM-10.30PM,YES,8,1.8,N
TW1,BLK 25/26 TECK WHYE LANE,19200.0,41300.0,SURFACE CAR PARK,COUPON PARKING,7AM-10.30PM,SUN & PH FR 1PM-10.30PM,NO,0,0,N`;

describe('carparks', () => {
  it('parses free parking wording conservatively', () => {
    expect(parseFreeParking('SUN & PH FR 7AM-10.30PM')).toBe('sun-ph-7am');
    expect(parseFreeParking('SUN & PH FR 1PM-10.30PM')).toBe('sun-ph-1pm');
    expect(parseFreeParking('NO')).toBeUndefined();
    expect(parseFreeParking('SOMETHING NEW')).toBeUndefined();
  });

  it('builds the catalogue from HDB, totals and DataMall', () => {
    const { carparks, version } = buildCatalog({
      hdbCsv: HDB_CSV,
      hdbAvailability: { items: [{ carpark_data: [{ carpark_number: 'CK7', carpark_info: [{ lot_type: 'C', total_lots: '298', lots_available: '236' }, { lot_type: 'Y', total_lots: '20', lots_available: '5' }] }] }] },
      ltaRows: [
        { CarParkID: 'CK7', Agency: 'HDB', LotType: 'C', AvailableLots: 236, Location: '1.38 103.75', Development: 'BLK 135A' },
        { CarParkID: '23', Agency: 'LTA', LotType: 'C', AvailableLots: 477, Location: '1.30403 103.83206', Development: 'ION Orchard', Area: 'Orchard' },
        { CarParkID: 'A0007', Agency: 'URA', LotType: 'C', AvailableLots: 224, Location: '1.3053280313212745 103.82957069514487', Development: 'ANGULLIA PARK OFF ST' },
        { CarParkID: 'X1', Agency: 'URA', LotType: 'C', AvailableLots: 1, Location: '' },
      ],
      uraRows: null,
    });
    expect(version).toBeTruthy();
    const ck7 = carparks.find((c) => c.id === 'HDB:CK7')!;
    expect(ck7).toMatchObject({ type: 'multi-storey', system: 'electronic', freeParking: 'sun-ph-7am', night: true, decks: 8, heightM: 1.8, totals: { C: 298, Y: 20 }, live: true });
    expect(isCovered(ck7)).toBe(true);
    const acb = carparks.find((c) => c.id === 'HDB:ACB')!;
    expect(acb).toMatchObject({ central: true, basement: true, type: 'basement' });
    expect(acb.freeParking).toBeUndefined();
    const tw1 = carparks.find((c) => c.id === 'HDB:TW1')!;
    expect(tw1).toMatchObject({ shortTerm: '7am-10.30pm', freeParking: 'sun-ph-1pm', night: false, system: 'coupon' });
    expect(tw1.heightM).toBeUndefined();
    expect(isCovered(tw1)).toBe(false);
    expect(carparks.find((c) => c.id === 'LTA:23')).toMatchObject({ name: 'ION Orchard', area: 'Orchard', lat: 1.30403 });
    expect(carparks.find((c) => c.id === 'URA:A0007')).toMatchObject({ name: 'Angullia Park Off St', central: true });
    expect(carparks.find((c) => c.id === 'URA:X1')).toBeUndefined();
  });

  it('normalises availability per carpark and lot type', () => {
    const lots = normaliseAvailability([
      { CarParkID: 'CK7', Agency: 'HDB', LotType: 'C', AvailableLots: 236 },
      { CarParkID: 'CK7', Agency: 'HDB', LotType: 'Y', AvailableLots: '5' },
      { CarParkID: 'CK7', Agency: 'HDB', LotType: 'H', AvailableLots: 9 },
      { CarParkID: '23', Agency: 'LTA', LotType: 'C', AvailableLots: 0 },
    ]);
    expect(lots).toEqual({ 'HDB:CK7': [236, 5], 'LTA:23': [0, -1] });
  });

  it('parses URA rate bands', () => {
    expect(parseUraTime('08.30 AM')).toBe('0830');
    expect(parseUraTime('12.00 AM')).toBe('0000');
    expect(parseUraTime('05.00 PM')).toBe('1700');
    const m = uraBands([
      { ppCode: 'A0004', vehCat: 'Car', startTime: '08.30 AM', endTime: '05.00 PM', weekdayRate: '$0.50', weekdayMin: '30 mins', satdayRate: '$0.50', sunPHRate: '$0.00', parkingSystem: 'C', parkCapacity: 69 },
    ]);
    expect(m.get('A0004')).toMatchObject({ system: 'coupon', capacity: { C: 69 }, bands: [{ veh: 'C', start: '0830', end: '1700', weekday: 0.5, sundayPH: 0, unitMin: 30 }] });
  });
});

describe('ev', () => {
  const raw = {
    LastUpdatedTime: '2026-10-27 07:20:00',
    evLocationsData: [
      {
        address: '142A PASIR RIS STREET 11 SINGAPORE 511142',
        name: 'BLK 142A PASIR RIS STREET 11 MULTI STOREY CAR PARK',
        longtitude: 103.959758,
        latitude: 1.362839,
        postalCode: '511142',
        chargingPoints: [
          {
            status: '0',
            operatingHours: '',
            operator: 'STRIDES YTL PTE. LTD.',
            position: 'L3A 128',
            plugTypes: [{ plugType: 'Type 2', price: '0.6980', current: 'AC', powerRating: '7.4', priceType: 'kWh', evIds: [{ evCpId: 'R122901R-001', status: '0' }] }],
          },
          {
            status: '1',
            operator: 'SP MOBILITY PTE. LTD.',
            position: 'L4 51 & 52',
            plugTypes: [{ plugType: 'Combo 2', price: '0.8938', current: 'DC', powerRating: '50', priceType: 'kWh', evIds: [{ evCpId: 'R114858R-001', status: '1' }, { evCpId: 'R114858R-002', status: '' }] }],
          },
          { status: '100', operator: 'X PTE. LTD.', position: 'B1', plugTypes: [{ plugType: 'CHAdeMO', price: '', priceType: '', current: 'DC', powerRating: '', evIds: [] }] },
        ],
      },
      { name: 'NO COORDS', latitude: '', longtitude: '', chargingPoints: [] },
    ],
  };
  it('normalises the batch file', () => {
    const { updatedAt, sites } = normaliseEv(raw);
    expect(updatedAt).toBe('2026-10-27T07:20:00+08:00');
    expect(sites).toHaveLength(1);
    const s = sites[0]!;
    expect(s.name).toBe('Blk 142A Pasir Ris Street 11 Multi Storey Car Park');
    expect(s.address).toBe('142A Pasir Ris Street 11');
    expect(s.operators).toEqual(['Strides YTL', 'SP Mobility', 'X']);
    expect(s.connectors.map((c) => [c.plug, c.kw, c.price, c.status])).toEqual([
      ['type2', 7.4, 0.7, 'in-use'],
      ['ccs2', 50, 0.89, 'available'],
      ['ccs2', 50, 0.89, 'out-of-service'],
      ['chademo', null, null, 'out-of-service'],
    ]);
  });
  it('accepts the per-postal-code sample shape and spellings', () => {
    const { sites } = normaliseEv({ value: { evLocationsData: [{ name: 'A', longitude: '103.8', latitude: '1.3', chargingPoints: [{ status: '1', plugTypes: [{ plugType: 'CCS2', chargingSpeed: '22', evIds: [{ id: 'x', status: 1 } as never] }] }] }] } });
    expect(sites[0]!.connectors[0]).toMatchObject({ plug: 'ccs2', kw: 22, status: 'available' });
  });
  it('maps operators and plugs', () => {
    expect(operatorName('CHARGE+ PTE. LTD.')).toBe('Charge+');
    expect(operatorName('TESLA MOTORS SINGAPORE PRIVATE LIMITED')).toBe('Tesla');
    expect(operatorName('NEWCO ENERGY PTE. LTD.')).toBe('Newco Energy');
    expect(plugKind('Combo 2')).toBe('ccs2');
    expect(plugKind('Type 2')).toBe('type2');
    expect(plugKind('GB/T')).toBe('other');
    expect(sgtIso('nonsense')).toBeNull();
  });
});

describe('roads', () => {
  it('names cameras from Annex G and reads the capture time from the link', () => {
    const link = 'https://x.s3.amazonaws.com/2026-10-27/07-20/2701_0717_20261026232014_3BCA25.jpg?X-Amz-Expires=900';
    expect(takenAtFromLink(link)).toBe('2026-10-26T23:20:14.000Z');
    const cams = normaliseLtaCameras([
      { CameraID: '4799', Latitude: 1.26, Longitude: 103.82, ImageLink: link },
      { CameraID: '2701', Latitude: 1.447, Longitude: 103.77, ImageLink: link },
      { CameraID: '9999', Latitude: 1.3, Longitude: 103.8, ImageLink: link },
    ]);
    expect(cams.map((c) => [c.id, c.group, c.short])).toEqual([
      ['2701', 'Woodlands', 'Causeway'],
      ['4799', 'Sentosa', 'Tower 2'],
      ['9999', 'Other', 'Camera 9999'],
    ]);
  });
  it('reads data.gov.sg cameras', () => {
    const cams = normaliseDgsCameras({ items: [{ cameras: [{ camera_id: '4713', timestamp: '2026-10-27T07:40:36+08:00', image: 'https://img/x.jpg', location: { latitude: 1.34, longitude: 103.63 } }] }] });
    expect(cams[0]).toMatchObject({ id: '4713', name: 'Tuas Checkpoint', takenAt: '2026-10-26T23:40:36.000Z' });
  });
  it('parses incident times in Singapore time', () => {
    const now = new Date('2026-10-27T00:00:00Z');
    expect(incidentTime('(27/10)07:13 Accident on BKE', now)).toBe('2026-10-26T23:13:00.000Z');
    expect(incidentTime('(31/12)23:50 Roadworks', new Date('2027-01-01T01:00:00Z'))).toBe('2026-12-31T15:50:00.000Z');
    expect(normaliseIncidents([{ Type: 'Accident', Latitude: 1.42, Longitude: 103.77, Message: '(27/10)07:13 Accident on BKE (towards PIE) after SLE. Avoid lane 3.' }], now)[0]!.type).toBe('Accident');
  });
  it('converts faulty traffic lights from SVY21', () => {
    const [l] = normaliseFaultyLights([{ AlarmID: 'GL703034136', NodeID: '3', Type: 2, StartDate: '2026-10-27 07:00', XCoordinate: 30314.7936, YCoordinate: 31490.4942, Message: 'Blackout' }]);
    expect(l).toMatchObject({ kind: 'blackout' });
    expect(l!.lat).toBeCloseTo(1.301063, 4);
  });
  it('sums expressway segments and picks checkpoint times', () => {
    const t = normaliseTravelTimes([
      { Name: 'BKE', Direction: 1, FarEndPoint: 'WOODLANDS CENTRE', StartPoint: 'A', EndPoint: 'B', EstTime: 2 },
      { Name: 'BKE', Direction: 1, FarEndPoint: 'WOODLANDS CENTRE', StartPoint: 'B', EndPoint: 'C', EstTime: 3 },
      { Name: 'BKE', Direction: 2, FarEndPoint: 'PIE', StartPoint: 'C', EndPoint: 'B', EstTime: 4 },
      { Name: 'AYE', Direction: 1, FarEndPoint: 'TUAS CHECKPOINT', StartPoint: 'X', EndPoint: 'Y', EstTime: 9 },
    ]);
    expect(t.checkpoints).toEqual([
      { checkpoint: 'Woodlands', via: 'BKE', minutes: 5 },
      { checkpoint: 'Tuas', via: 'AYE', minutes: 9 },
    ]);
    expect(t.expressways).toHaveLength(3);
  });
  it('keeps only active flood alerts', () => {
    const now = new Date('2026-10-27T10:00:00+08:00');
    const rows = [
      { alertId: 'a1', msgType: 'Alert', dateTime: '2026-10-27T08:00:00+08:00', areaDesc: 'Jalan Boon Lay', circle: '1.33,103.71 0.5', headline: 'Flash flood', expires: '2026-10-28T08:00:00+08:00' },
      { alertId: 'a2', msgType: 'Alert', dateTime: '2026-10-27T08:10:00+08:00', areaDesc: 'Bukit Timah Rd', circle: '1.32,103.81 0.3', headline: 'Flash flood' },
      { alertId: 'a2', msgType: 'Cancel', dateTime: '2026-10-27T09:00:00+08:00', areaDesc: 'Bukit Timah Rd' },
      { alertId: 'a3', msgType: 'Alert', dateTime: '2026-10-26T08:00:00+08:00', areaDesc: 'Old', expires: '2026-10-27T08:00:00+08:00' },
    ];
    const f = normaliseFloods(rows, now);
    expect(f.map((x) => x.id)).toEqual(['a1']);
    expect(f[0]).toMatchObject({ lat: 1.33, lng: 103.71, radiusKm: 0.5 });
  });
});

describe('nea + onemap', () => {
  it('normalises forecast, stations and outlook', () => {
    expect(
      normaliseForecast({
        data: {
          area_metadata: [{ name: 'Bishan', label_location: { latitude: 1.35, longitude: 103.84 } }],
          items: [{ update_timestamp: 't', valid_period: { start: 's', end: 'e', text: '8.00 am to 10.00 am' }, forecasts: [{ area: 'Bishan', forecast: 'Fair' }] }],
        },
      })?.areas,
    ).toEqual([{ name: 'Bishan', latitude: 1.35, longitude: 103.84, forecast: 'Fair' }]);
    expect(normaliseStations({ data: { stations: [{ id: 'S1', name: 'A', location: { latitude: 1, longitude: 2 } }], readings: [{ timestamp: 't', data: [{ stationId: 'S1', value: 28.4 }] }] } })?.gauges[0]?.mm).toBe(28.4);
    const o = normaliseOutlook({ data: { records: [{ forecasts: [{ day: 'Wednesday', timestamp: '2026-10-28T00:00:00+08:00', forecast: { text: 'Thundery Showers' }, temperature: { low: 24, high: 33 } }] }] } });
    expect(o).toEqual([{ day: 'Wednesday', date: '2026-10-28', text: 'Thundery Showers', low: 24, high: 33 }]);
  });
  it('normalises OneMap places', () => {
    const r = normalisePlaces({ results: [{ SEARCHVAL: 'ION ORCHARD', ADDRESS: '2 ORCHARD TURN ION ORCHARD SINGAPORE 238801', POSTAL: '238801', LATITUDE: '1.30398', LONGITUDE: '103.83203' }] });
    expect(r[0]).toMatchObject({ name: 'ION Orchard', address: '2 Orchard Turn ION Orchard', postal: '238801' });
  });
});
