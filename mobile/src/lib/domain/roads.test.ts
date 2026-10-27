import { describe, expect, it } from 'vitest';
import type { RoadsResponse } from '../../../../shared/contract';
import { roadAlertsNear, stripLtaTime } from './roads';

const bishan = { lat: 1.351, lng: 103.8365 };
const roads: RoadsResponse = {
  incidents: [
    { type: 'Roadwork', lat: 1.31284, lng: 103.95288, message: '(27/10)15:13 Road Works on ECP (towards Changi) after Bayshore Rd. Avoid lane 3.', at: '2026-10-27T07:13:00.000Z' },
    { type: 'Vehicle breakdown', lat: 1.32963, lng: 103.85037, message: '(27/10)15:15 Vehicle Breakdown on PIE (towards Changi) after Thomson Rd.', at: '2026-10-27T07:15:00.000Z' },
    { type: 'Accident', lat: 1.3505, lng: 103.84, message: '(27/10)15:20 Accident on Bishan Rd.', at: '2026-10-27T07:20:00.000Z' },
  ],
  faultyLights: [{ id: 'A1', kind: 'blackout', lat: 1.36, lng: 103.84, message: '(27/10)13:01 Blackout at Bishan St 22/Marymount Rd.', startedAt: null }],
  checkpoints: [],
  expressways: [],
  floods: [],
  serverTime: '',
  fetchedAt: '',
  stale: false,
};

describe('road alerts near a place', () => {
  it('keeps only alerts within 4 km, nearest first, in plain words', () => {
    const a = roadAlertsNear(roads, bishan);
    expect(a.map((x) => x.title)).toEqual(['Accident', 'Traffic lights out', 'Vehicle breakdown']);
    expect(a[0]).toMatchObject({ severity: 'high', icon: 'alert', detail: 'Accident on Bishan Rd.' });
    expect(a[2]!.distanceM).toBeGreaterThan(2000);
    expect(a.every((x) => x.distanceM <= 4000)).toBe(true);
  });
  it('nothing without a place or data', () => {
    expect(roadAlertsNear(roads, null)).toEqual([]);
    expect(roadAlertsNear(null, bishan)).toEqual([]);
  });
  it('strips the LTA time prefix', () => {
    expect(stripLtaTime('(27/10)15:15 Vehicle Breakdown on PIE')).toBe('Vehicle Breakdown on PIE');
    expect(stripLtaTime('No prefix here')).toBe('No prefix here');
  });
});
