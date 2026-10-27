import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { AvailabilityResponse, CamerasResponse, EvResponse, RadarResponse, RoadsResponse, WeatherResponse } from '../../../shared/contract';
import { api } from '../lib/api/client';
import type { LatLng } from '../lib/domain/geo';
import { useLocation, type LocationStatus } from '../lib/hooks/location';
import { usePoll, type PollState } from '../lib/hooks/poll';
import type { Tab } from './tabs';

interface Data {
  here: LatLng | null;
  locStatus: LocationStatus;
  isDemoLocation: boolean;
  requestLocation: () => Promise<void>;
  availability: PollState<AvailabilityResponse>;
  ev: PollState<EvResponse>;
  cameras: PollState<CamerasResponse>;
  roads: PollState<RoadsResponse>;
  weather: PollState<WeatherResponse>;
  radar: PollState<RadarResponse>;
}

const Ctx = createContext<Data | null>(null);

/**
 * All live feeds, polled only while useful (plan §11.7): the visible tab polls fast, the rest slowly or not at
 * all. Every feed is island-wide; the phone filters by place, so no location ever leaves the device.
 */
export function DataProvider({ tab, needEv, needCameras, children }: { tab: Tab; needEv: boolean; needCameras: boolean; children: ReactNode }) {
  const loc = useLocation();
  // Persisted: reopening the app with no signal (basement carparks) still shows the last counts, if recent.
  const availability = usePoll('availability', api.availability, tab === 'parking' ? 60_000 : 300_000, true, { persist: true });
  // EV tab / EV owners: every 3 min. Everyone else: every 15 min, for the "N chargers" facts on carparks.
  const ev = usePoll('ev', api.ev, tab === 'ev' || needEv ? 180_000 : 900_000);
  const cameras = usePoll('cameras', api.cameras, 60_000, tab === 'roads' || needCameras);
  // Roads also carries PUB flood alerts, shown as a banner on every tab.
  const roads = usePoll('roads', api.roads, tab === 'roads' ? 120_000 : 300_000);
  const weather = usePoll('weather', api.weather, 300_000);
  const radar = usePoll('radar', api.radar, 240_000, tab === 'weather');

  const value = useMemo<Data>(
    () => ({ here: loc.here, locStatus: loc.status, isDemoLocation: loc.isDemoLocation, requestLocation: loc.request, availability, ev, cameras, roads, weather, radar }),
    [loc.here, loc.status, loc.isDemoLocation, loc.request, availability, ev, cameras, roads, weather, radar],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): Data {
  const d = useContext(Ctx);
  if (!d) throw new Error('useData outside DataProvider');
  return d;
}
