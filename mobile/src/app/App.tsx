import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AdSlot, SHOW_AD_SLOT } from '../components/AdSlot';
import { BottomSheet, type Snap } from '../components/BottomSheet';
import { Icon } from '../components/Icon';
import type { Fc, MapSelect, MapViewHandle } from '../components/MapView';
import { Sheet } from '../components/Sheet';
import { ScreenHeader } from '../components/ui';
import { lotsFor } from '../lib/domain/availability';
import { clock, money, plural, timer } from '../lib/domain/format';
import { distanceM, formatDistance, inSingapore, nearest, type LatLng } from '../lib/domain/geo';
import { chargersNear, evRows, parkingRows } from '../lib/domain/lists';
import { estimateCost } from '../lib/domain/rates';
import type { RoadAlert } from '../lib/domain/roads';
import { forecastIcon, rainStatus, temperatureAt } from '../lib/domain/rain';
import { useNow } from '../lib/hooks/poll';
import { cancelReminders, mapsLink, navigationUrl, openExternal, shareText, type NavTarget } from '../lib/native';
import { DEFAULT_PARK_FILTERS } from '../lib/storage/store';
import { api, describeError, isDemo } from '../lib/api/client';
import { CameraViewer } from '../screens/CameraViewer';
import { CarparkDetail } from '../screens/CarparkDetail';
import { ChargerDetail } from '../screens/ChargerDetail';
import { EvHeader, EvList } from '../screens/EvPanel';
import { Onboarding } from '../screens/Onboarding';
import { ParkedScreen, ParkSheet } from '../screens/Parked';
import { ParkingHeader, ParkingList } from '../screens/ParkingPanel';
import { RoadsPage } from '../screens/RoadsPanel';
import { SearchScreen, type SearchPick } from '../screens/SearchScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { WeatherBody, WeatherHeader } from '../screens/WeatherPanel';
import { AppStoreProvider, useStore } from './AppStore';
import { hideBoot } from './boot';
import { DataProvider, useData } from './DataContext';
import { BackProvider, useBackHandler, useResolvedTheme } from './platform';
import { TABS, type Tab } from './tabs';

type Route =
  | { name: 'carpark'; id: string }
  | { name: 'charger'; id: string }
  | { name: 'camera'; id: string }
  | { name: 'search'; saveAs?: 'home' | 'work' }
  | { name: 'parked' }
  | { name: 'settings' };

const RESUME_RESET_MS = 2 * 3600_000;
/** MapLibre is the heaviest dependency: load it in its own chunk so the panel paints first. */
const MapView = lazy(() => import('../components/MapView').then((m) => ({ default: m.MapView })));

function Shell() {
  const store = useStore();
  const theme = useResolvedTheme(store.prefs.theme);
  const [tab, setTab] = useState<Tab>('parking');
  const [stack, setStack] = useState<Route[]>([]);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    // Pins are drawn on a canvas with the app fonts, so wait for them (max 2.5 s).
    const t = window.setTimeout(() => setFontsReady(true), 2500);
    Promise.all([document.fonts.load('800 14px "Figtree Variable"'), document.fonts.load('800 14px "Space Grotesk Variable"'), document.fonts.load('900 14px "Figtree Variable"')])
      .catch(() => {})
      .finally(() => {
        window.clearTimeout(t);
        setFontsReady(true);
      });
  }, []);
  useEffect(() => {
    if (store.ready && fontsReady) hideBoot();
  }, [store.ready, fontsReady]);

  const top = stack[stack.length - 1];
  const needEv = tab === 'ev' || top?.name === 'carpark' || top?.name === 'charger' || store.prefs.vehicle === 'ev';
  if (!store.ready || !fontsReady) return null;
  return (
    <DataProvider tab={tab} needEv={needEv} needCameras={top?.name === 'camera'}>
      <Main theme={theme} tab={tab} setTab={setTab} stack={stack} setStack={setStack} />
    </DataProvider>
  );
}

const nearMeLabel = 'you';

function Main({ theme, tab, setTab, stack, setStack }: { theme: 'light' | 'dark'; tab: Tab; setTab: (t: Tab) => void; stack: Route[]; setStack: (f: (s: Route[]) => Route[]) => void }) {
  const store = useStore();
  const { prefs, setPrefs } = store;
  const data = useData();
  const now = useNow(15_000);
  const mapRef = useRef<MapViewHandle>(null);
  const [selected, setSelected] = useState<MapSelect>(null);
  // Weather opens low so the radar gets most of the screen; pull up for the 4-day outlook.
  const [snaps, setSnaps] = useState<Record<Tab, Snap>>({ parking: 'half', ev: 'half', roads: 'full', weather: 'peek' });
  const [moved, setMoved] = useState<LatLng | null>(null);
  const [navFor, setNavFor] = useState<{ to: LatLng; mode: 'driving' | 'walking' } | null>(null);
  const [parkTarget, setParkTarget] = useState<{ name: string; lat: number; lng: number; carparkId: string | null } | null>(null);
  const [longPress, setLongPress] = useState<LatLng | null>(null);
  const [alert, setAlert] = useState<RoadAlert | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [mapEpoch, setMapEpoch] = useState(0);
  const [hostH, setHostH] = useState(700);
  const [bottomH, setBottomH] = useState(120);
  const [topH, setTopH] = useState(110);
  const hostRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const top = stack[stack.length - 1];
  const push = (r: Route) => setStack((s) => [...s, r]);
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), [setStack]);
  useBackHandler(stack.length > 0 && !(top?.name === 'camera' && (data.cameras.data?.cameras.length ?? 0) > 0), pop);
  useBackHandler(stack.length === 0 && selected != null, () => setSelected(null));

  const tabs = TABS.filter((t) => t.id !== 'ev' || prefs.showEvTab);
  useEffect(() => {
    if (tab === 'ev' && !prefs.showEvTab) setTab('parking');
  }, [prefs.showEvTab, tab, setTab]);

  // Root back: other tabs → Parking; Parking → exit.
  useEffect(() => {
    rootBack = () => {
      if (tab === 'parking') return false;
      setTab('parking');
      return true;
    };
  });

  // Coming back after a long time (Android keeps the app alive): reset to "Near you" like a fresh launch.
  useEffect(() => {
    let away = 0;
    const onActive = (active: boolean) => {
      if (!active) away = Date.now();
      else if (away && Date.now() - away > RESUME_RESET_MS) store.setPlace(null);
    };
    if (Capacitor.isNativePlatform()) {
      const sub = CapApp.addListener('appStateChange', ({ isActive }) => onActive(isActive));
      return () => void sub.then((h) => h.remove());
    }
    const onVis = () => onActive(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Layout measurements for the sheet snap points and map padding.
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (hostRef.current) setHostH(hostRef.current.clientHeight);
      if (bottomRef.current) setBottomH(bottomRef.current.offsetHeight);
      if (topRef.current) setTopH(topRef.current.getBoundingClientRect().bottom);
    });
    [hostRef, bottomRef, topRef].forEach((r) => r.current && ro.observe(r.current));
    return () => ro.disconnect();
  }, []);

  /* ---------------- Place ---------------- */
  const here = data.here;
  const place = store.place;
  const placeAt: LatLng | null = place ? { lat: place.lat, lng: place.lng } : here;
  const placeLabel = place ? place.label : nearMeLabel;
  const placeKey = placeAt ? `${placeAt.lat.toFixed(5)},${placeAt.lng.toFixed(5)}` : 'none';
  const areaName = useMemo(() => {
    const areas = data.weather.data?.forecast?.areas;
    const n = here && areas ? nearest(here, areas, (a) => ({ lat: a.latitude, lng: a.longitude })) : null;
    return n && n.distanceM < 5000 ? n.item.name : null;
  }, [here?.lat, here?.lng, data.weather.data]);

  /* ---------------- Lists ---------------- */
  const avail = data.availability.data;
  const evSites = data.ev.data?.sites ?? null;
  const parking = useMemo(
    () =>
      placeAt
        ? parkingRows({ carparks: store.carparks, at: placeAt, vehicle: prefs.vehicle, avail, now, stayMin: prefs.stayMin, filters: prefs.parkFilters, sort: prefs.sort, pace: prefs.walkingPaceMpm })
        : { rows: [], walkMin: 10, hidden: 0 },
    // `now` is bucketed to the minute through the availability refresh; recompute on data, place and prefs changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.carparks, placeKey, prefs.vehicle, avail, prefs.stayMin, prefs.parkFilters, prefs.sort, prefs.walkingPaceMpm, Math.floor(now / 60_000)],
  );
  const plugs = prefs.plugs;
  const ev = useMemo(() => (placeAt && evSites ? evRows(evSites, placeAt, plugs, prefs.evFilters, prefs.walkingPaceMpm) : { rows: [], walkMin: 15 }), [evSites, placeKey, plugs, prefs.evFilters, prefs.walkingPaceMpm]);
  const operators = useMemo(() => [...new Set((evSites ?? []).flatMap((s) => s.operators))].sort(), [evSites]);

  /* ---------------- Map features ---------------- */
  const carparkFc = useMemo<Fc>(() => {
    const costs = prefs.sort === 'cheapest' ? new Map(parking.rows.map((r) => [r.cp.id, r.cost.amount])) : null;
    const ref = placeAt ?? { lat: 1.3521, lng: 103.8198 };
    const list = store.carparks
      .filter((c) => !(prefs.parkFilters.hideSeasonOnly && c.shortTerm === 'no'))
      .map((c) => ({ c, d: distanceM(ref, c) }))
      .sort((a, b) => a.d - b.d);
    return {
      type: 'FeatureCollection',
      features: list.map(({ c }, rank) => {
        const lots = lotsFor(c, prefs.vehicle, avail, now);
        const cost = costs?.get(c.id);
        const label = costs && costs.has(c.id) ? (cost == null ? '—' : money(cost)) : lots.free == null ? '—' : lots.free > 999 ? '999+' : String(lots.free);
        return { type: 'Feature', geometry: { type: 'Point', coordinates: [c.lng, c.lat] }, properties: { id: c.id, level: lots.level, label, rank } };
      }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.carparks, avail, prefs.vehicle, prefs.sort, prefs.parkFilters.hideSeasonOnly, parking.rows, placeKey]);

  const evFc = useMemo<Fc>(() => {
    const ref = placeAt ?? { lat: 1.3521, lng: 103.8198 };
    const list = (evSites ?? []).map((s) => ({ s, d: distanceM(ref, s) })).sort((a, b) => a.d - b.d);
    const visible = new Set(ev.rows.map((r) => r.site.id));
    return {
      type: 'FeatureCollection',
      features: list
        .map(({ s }, rank) => {
          const fit = s.connectors.filter((c) => c.plug !== 'other' && plugs.includes(c.plug));
          if (!fit.length) return null;
          const free = fit.filter((c) => c.status === 'available').length;
          const inUse = fit.filter((c) => c.status === 'in-use').length;
          const level = free > 0 ? 'plenty' : inUse > 0 ? 'full' : 'none';
          return { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] }, properties: { id: s.id, level, label: `${free}/${fit.length}`, rank: visible.has(s.id) ? rank : rank + 10_000 } };
        })
        .filter((f): f is NonNullable<typeof f> => f != null),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evSites, plugs, placeKey, ev.rows]);

  const cams = data.cameras.data?.cameras ?? [];
  const roads = data.roads.data;
  const floodFc = useMemo<Fc>(
    () => ({
      type: 'FeatureCollection',
      features: (roads?.floods ?? [])
        .filter((f) => f.lat != null && f.lng != null)
        .map((f) => {
          const r = Math.max(0.15, f.radiusKm ?? 0.3);
          const coords = Array.from({ length: 49 }, (_, i) => {
            const a = (i / 48) * Math.PI * 2;
            return [f.lng! + (r / (111.32 * Math.cos((f.lat! * Math.PI) / 180))) * Math.cos(a), f.lat! + (r / 110.57) * Math.sin(a)];
          });
          return { type: 'Feature' as const, geometry: { type: 'Polygon' as const, coordinates: [coords] }, properties: { id: f.id } };
        }),
    }),
    [roads],
  );
  const nearFlood = useMemo(() => {
    if (!placeAt) return null;
    return (roads?.floods ?? []).find((f) => f.lat != null && f.lng != null && distanceM(placeAt, { lat: f.lat, lng: f.lng }) < (f.radiusKm ?? 0) * 1000 + 3000) ?? null;
  }, [roads, placeKey]);

  /* ---------------- Radar player ---------------- */
  const frames = data.radar.data?.frames ?? [];
  const [frame, setFrame] = useState(-1);
  const [playing, setPlaying] = useState(true);
  const reduceMotion = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  useEffect(() => {
    if (!frames.length) return;
    frames.forEach((f) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = api.radarFrameUrl(f.ts);
    });
    setFrame(frames.length - 1);
  }, [frames.map((f) => f.ts).join()]);
  useEffect(() => {
    if (tab !== 'weather' || !playing || reduceMotion || frames.length < 2) return;
    const t = window.setTimeout(() => setFrame((i) => (i + 1) % frames.length), frame === frames.length - 1 ? 1600 : 650);
    return () => window.clearTimeout(t);
  }, [tab, playing, frame, frames.length, reduceMotion]);
  const radarFrame = frames[Math.max(0, frame)];
  const radar = radarFrame && data.radar.data ? { url: api.radarFrameUrl(radarFrame.ts), bbox: data.radar.data.bbox } : null;

  /* ---------------- Map focus ---------------- */
  const focusPlace = useCallback(() => {
    if (!placeAt) return;
    const pts = tab === 'ev' ? ev.rows.slice(0, 5).map((r) => r.site) : parking.rows.slice(0, 6).map((r) => r.cp);
    // Concept A framing: about zoom 15.5, where roads, parks and many pins are visible (not grey building outlines).
    if (pts.length) mapRef.current?.fit([placeAt, ...pts], 15.8);
    else mapRef.current?.flyTo(placeAt, 15.4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeKey, tab, parking.rows.length > 0, ev.rows.length > 0]);
  const lastFocus = useRef('');
  const awayView = useRef(false);
  useEffect(() => {
    if (!placeAt || (tab !== 'parking' && tab !== 'ev')) return;
    const key = `${placeKey}|${parking.rows.length > 0}|${mapEpoch}`;
    if (lastFocus.current === key && !awayView.current) return;
    lastFocus.current = key;
    awayView.current = false;
    focusPlace();
  }, [placeKey, tab, parking.rows.length > 0, focusPlace, mapEpoch]);
  // Weather: show the whole island (and the rain coming in) in the gap between the top bar and the radar controls.
  useEffect(() => {
    if (tab !== 'weather') return;
    awayView.current = true;
    const id = window.setTimeout(
      () =>
        mapRef.current?.fit(
          [
            { lat: 1.235, lng: 103.62 },
            { lat: 1.465, lng: 104.0 },
            ...(placeAt ? [placeAt] : []),
          ],
          11,
          6,
        ),
      60,
    );
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, mapEpoch]);

  /* ---------------- Actions ---------------- */
  const navigate = (to: LatLng, mode: 'driving' | 'walking' = 'driving') => {
    if (mode === 'walking' || prefs.navApp === 'google') return void openExternal(navigationUrl('google', to, mode));
    if (prefs.navApp === 'waze') return void openExternal(navigationUrl('waze', to));
    setNavFor({ to, mode });
  };
  const pickNav = (app: NavTarget, remember: boolean) => {
    if (!navFor) return;
    if (remember) setPrefs({ navApp: app });
    void openExternal(navigationUrl(app, navFor.to, navFor.mode));
    setNavFor(null);
  };
  const nearMe = async () => {
    store.setPlace(null);
    setMoved(null);
    if (!here) await data.requestLocation();
    else mapRef.current?.flyTo(here, 15.6);
  };
  const choose = (p: SearchPick) => {
    const s = top?.name === 'search' ? top : null;
    if (s?.saveAs) {
      store.savePlace({ label: s.saveAs === 'home' ? 'Home' : 'Work', icon: s.saveAs, lat: p.lat, lng: p.lng, address: p.sub ?? p.label });
      setStack((st) => st.slice(0, -1));
      return;
    }
    store.setPlace({ kind: p.kind === 'carpark' ? 'carpark' : p.kind, label: p.label, lat: p.lat, lng: p.lng });
    store.addRecent({ label: p.label, sub: p.sub, lat: p.lat, lng: p.lng });
    setMoved(null);
    setSelected(p.carparkId ? { kind: 'carpark', id: p.carparkId } : null);
    if (tab !== 'parking' && tab !== 'ev') setTab('parking');
    setSnaps((s) => ({ ...s, parking: 'half', ev: 'half' }));
    setStack((st) => {
      const base = st.filter((r) => r.name !== 'search');
      return p.carparkId ? [...base, { name: 'carpark', id: p.carparkId }] : base;
    });
  };
  const onMapSelect = (s: MapSelect) => {
    if (!s) return setSelected(null);
    setSelected(s);
    setSnaps((x) => ({ ...x, [tab]: x[tab] === 'peek' ? 'half' : x[tab] }));
  };
  const showToast = (t: string) => {
    setToast(t);
    window.setTimeout(() => setToast(null), 2600);
  };

  /* ---------------- Sheet ---------------- */
  const sheetTop = topH + 8;
  const fullH = Math.max(300, hostH - sheetTop);
  const heights: Record<Snap, number> = {
    peek: tab === 'weather' ? 168 : 140,
    // Weather: enough for the rain-now card, next 2 hours and the 4-day strip, while keeping most of the radar.
    half: tab === 'weather' ? Math.min(420, Math.round(hostH * 0.56)) : Math.round(hostH * 0.5),
    full: fullH,
  };
  const snap = snaps[tab];
  const sheetH = heights[snap];
  const lotsOfVehicle = (cp: (typeof store.carparks)[number]) => lotsFor(cp, prefs.vehicle, avail, now);
  const weather = data.weather.data;
  const temp = temperatureAt(weather, placeAt);
  const rain = rainStatus(weather, placeAt, now);
  const wIcon = rain.state === 'raining' ? 'umbrella' : 'forecast' in rain ? forecastIcon(rain.forecast) : 'cloud';
  const parked = store.parked;
  const parkedCp = parked?.carparkId ? store.carparkById.get(parked.carparkId) ?? null : null;
  const parkedCost = parked && parkedCp ? estimateCost(parkedCp, prefs.vehicle, parked.startedAt, (now - parked.startedAt) / 60_000).amount : null;

  let header: ReactNode = null;
  let body: ReactNode = null;
  if (tab === 'parking') {
    header = (
      <ParkingHeader
        count={parking.rows.length}
        placeLabel={placeLabel}
        updatedAt={avail ? Date.parse(avail.fetchedAt) : null}
        error={data.availability.error}
        now={now}
        onRetry={data.availability.refresh}
        prefs={prefs}
        setPrefs={setPrefs}
        hasPlace={Boolean(placeAt)}
      />
    );
    body = (
      <ParkingList
        rows={parking.rows}
        walkMin={parking.walkMin}
        hidden={parking.hidden}
        vehicle={prefs.vehicle}
        stayMin={prefs.stayMin}
        evSites={evSites}
        selectedId={selected?.kind === 'carpark' ? selected.id : null}
        onOpen={(id) => {
          setSelected({ kind: 'carpark', id });
          push({ name: 'carpark', id });
        }}
        hasPlace={Boolean(placeAt)}
        onSearch={() => push({ name: 'search' })}
        onLocate={nearMe}
        onClearFilters={() => setPrefs({ parkFilters: DEFAULT_PARK_FILTERS })}
        availabilityAt={avail ? Date.parse(avail.fetchedAt) : null}
        now={now}
      />
    );
  } else if (tab === 'ev') {
    header = (
      <EvHeader
        count={ev.rows.length}
        placeLabel={placeLabel}
        receivedAt={data.ev.receivedAt}
        error={data.ev.error}
        now={now}
        onRetry={data.ev.refresh}
        prefs={prefs}
        setPrefs={setPrefs}
        operators={operators}
        hasPlace={Boolean(placeAt)}
      />
    );
    body = (
      <EvList
        rows={ev.rows}
        walkMin={ev.walkMin}
        selectedId={selected?.kind === 'charger' ? selected.id : null}
        onOpen={(id) => {
          setSelected({ kind: 'charger', id });
          push({ name: 'charger', id });
        }}
        hasPlace={Boolean(placeAt)}
        loading={!evSites}
        error={data.ev.error ? describeError(data.ev.error) : null}
        onRetry={data.ev.refresh}
        onSearch={() => push({ name: 'search' })}
      />
    );
  } else if (tab === 'roads') {
    // Full-screen page instead of a sheet over the map (see below).
    body = (
      <RoadsPage
        cameras={data.cameras}
        roads={data.roads}
        at={placeAt}
        placeLabel={placeLabel}
        now={now}
        locationOff={data.locStatus === 'denied'}
        onLocate={() => void nearMe()}
        onOpenCamera={(id) => push({ name: 'camera', id })}
        onOpenAlert={setAlert}
      />
    );
  } else {
    header = <WeatherHeader weather={weather} at={placeAt} placeLabel={placeLabel} now={now} receivedAt={data.weather.receivedAt} error={data.weather.error} onRetry={data.weather.refresh} />;
    body = (
      <WeatherBody
        weather={weather}
        at={placeAt}
        now={now}
        radarNote={data.radar.error ? (isDemo ? 'The rain radar needs the SG Car Buddy server (demo mode).' : `Rain radar unavailable: ${describeError(data.radar.error)}`) : null}
      />
    );
  }

  /* ---------------- Pushed screens ---------------- */
  let screen: ReactNode = null;
  if (top?.name === 'carpark') {
    const cp = store.carparkById.get(top.id);
    screen = !cp ? (
      <div className="screen">
        <ScreenHeader title="Carpark" onBack={pop} />
        <p className="list-note pad">This carpark is no longer listed.</p>
      </div>
    ) : (
      <CarparkDetail
        cp={cp}
        prefs={prefs}
        avail={avail}
        availError={data.availability.error}
        evSites={evSites}
        place={store.place && placeAt ? { label: placeLabel, at: placeAt } : null}
        here={here}
        now={now}
        saved={store.isSaved('carpark', cp.id)}
        onToggleSave={() => store.toggleItem('carpark', cp.id, cp.name)}
        onBack={pop}
        onNavigate={() => navigate(cp)}
        onParkHere={() => setParkTarget({ name: cp.name, lat: cp.lat, lng: cp.lng, carparkId: cp.id })}
        onShare={async () => {
          const r = await shareText(cp.name, `${cp.name} (${cp.agency} carpark ${cp.code})`, mapsLink(cp));
          if (r === 'copied') showToast('Link copied');
        }}
        onOpenCharger={(id) => push({ name: 'charger', id })}
        onRetry={data.availability.refresh}
        onStay={(m) => setPrefs({ stayMin: m })}
      />
    );
  } else if (top?.name === 'charger') {
    const site = evSites?.find((s) => s.id === top.id);
    const cp = site ? store.carparks.find((c) => distanceM(c, site) < 120 && chargersNear(c, [site]).length > 0) ?? null : null;
    screen = site ? (
      <ChargerDetail
        site={site}
        prefs={prefs}
        place={store.place && placeAt ? { label: placeLabel, at: placeAt } : null}
        here={here}
        carpark={cp}
        receivedAt={data.ev.receivedAt}
        now={now}
        saved={store.isSaved('charger', site.id)}
        onToggleSave={() => store.toggleItem('charger', site.id, site.name)}
        onBack={pop}
        onNavigate={() => navigate(site)}
        onOpenCarpark={(id) => push({ name: 'carpark', id })}
        onRetry={data.ev.refresh}
      />
    ) : (
      <div className="screen">
        <ScreenHeader title="EV charger" onBack={pop} />
        <p className="list-note pad">{data.ev.error ? "Charger data isn't available right now." : 'Loading charger…'}</p>
      </div>
    );
  } else if (top?.name === 'camera') {
    screen = cams.length ? (
      <CameraViewer cameras={cams} startId={top.id} now={now} receivedAt={data.cameras.receivedAt} onRefresh={data.cameras.refresh} onClose={pop} />
    ) : (
      <div className="screen">
        <ScreenHeader title="Traffic camera" onBack={pop} />
        <p className="list-note pad">Loading cameras…</p>
      </div>
    );
  } else if (top?.name === 'search') {
    screen = (
      <SearchScreen
        carparks={store.carparks}
        places={store.places}
        items={store.items}
        recents={store.recents}
        lotsOf={lotsOfVehicle}
        canUseLocation={data.locStatus === 'granted'}
        onBack={pop}
        onPick={choose}
        onNearMe={() => {
          pop();
          void nearMe();
        }}
        onSetSaved={(k) => push({ name: 'search', saveAs: k })}
        onClearRecents={store.clearRecents}
        onOpenItem={(it) => push(it.kind === 'carpark' ? { name: 'carpark', id: it.id } : { name: 'charger', id: it.id })}
        banner={top.saveAs ? `Search your ${top.saveAs === 'home' ? 'home' : 'work'} address, then pick it to save it.` : undefined}
      />
    );
  } else if (top?.name === 'parked') {
    screen = (
      <ParkedScreen
        parked={parked}
        carpark={parkedCp}
        vehicle={prefs.vehicle}
        now={now}
        onBack={pop}
        onWalk={() => parked && navigate(parked, 'walking')}
        onDone={() => {
          store.setParked(null);
          pop();
        }}
        onOpenCarpark={(id) => push({ name: 'carpark', id })}
      />
    );
  } else if (top?.name === 'settings') {
    screen = <SettingsScreen prefs={prefs} setPrefs={setPrefs} places={store.places} onRemovePlace={store.removePlace} onBack={pop} onRestartIntro={() => setPrefs({ onboarded: false })} />;
  }

  const homeWork = store.places.filter((p) => p.icon !== 'star');

  return (
    <div className={`app${SHOW_AD_SLOT ? ' has-ad' : ''}${parked ? ' has-parked' : ''}`} data-tab={tab} style={{ ['--top-h' as string]: `${topH}px` }}>
      <Suspense fallback={<div className="map-wrap" />}>
        <MapView
          key={theme}
          ref={mapRef}
          theme={theme}
          tab={tab}
          carparks={carparkFc}
          chargers={evFc}
          floods={floodFc}
          radar={radar}
          selected={selected}
          here={here}
          place={place && placeAt ? { label: place.label, at: placeAt } : null}
          parked={parked}
          padding={{ top: topH, bottom: bottomH + sheetH + (tab === 'weather' && snap !== 'full' ? 74 : 0) }}
          onSelect={onMapSelect}
          onUserMoved={(c) => (tab === 'parking' || tab === 'ev') && placeAt && distanceM(c, placeAt) > 300 && setMoved(c)}
          onLongPress={(p) => inSingapore(p) && setLongPress(p)}
          onReady={() => setMapEpoch((n) => n + 1)}
        />
      </Suspense>

      <div className="map-fade" aria-hidden="true" />
      <div className="top" ref={topRef}>
        <div className="search-pill">
          <button className="sp-main" onClick={() => push({ name: 'search' })}>
            <Icon name="search" />
            <span>{place ? place.label : 'Where to?'}</span>
          </button>
          <button className="ib soft" onClick={() => setPrefs({ theme: theme === 'dark' ? 'day' : 'night' })} aria-label={theme === 'dark' ? 'Switch to Day' : 'Switch to Night'}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <button className="ib soft" onClick={() => push({ name: 'settings' })} aria-label="Settings">
            <Icon name="gear" />
          </button>
        </div>
        <div className="chips">
          {place ? (
            <button className="chip on" onClick={() => void nearMe()} aria-label={`Showing ${place.label}. Tap to go back to near you.`}>
              <Icon name="pinf" size={15} />
              <span className="chip-t">{place.label}</span>
              <Icon name="x" size={14} />
            </button>
          ) : (
            <button className={`chip${here ? ' on' : ''}`} onClick={() => void nearMe()}>
              <Icon name="locate" size={15} />
              {here ? `Near you${areaName ? ` · ${areaName}` : ''}` : data.locStatus === 'denied' ? 'Location off' : 'Use my location'}
            </button>
          )}
          {homeWork.map((p) => (
            <button key={p.id} className="chip" onClick={() => choose({ label: p.label, sub: p.address, lat: p.lat, lng: p.lng, kind: 'saved' })}>
              <Icon name={p.icon} size={15} />
              {p.label}
            </button>
          ))}
          {tab !== 'weather' && (temp != null || weather) && (
            <button className="chip wx" onClick={() => setTab('weather')} aria-label={`Weather: ${temp ?? ''} degrees. Open weather.`}>
              <Icon name={wIcon} size={15} />
              {temp != null ? `${temp}°` : ''}
            </button>
          )}
        </div>
        {nearFlood && (
          <button className="flood-banner" onClick={() => setTab('roads')}>
            <Icon name="flood" />
            <span>
              <b>Flood alert near {placeLabel}</b>
              <small>
                {nearFlood.area} · PUB{nearFlood.issuedAt ? ` · ${clock(Date.parse(nearFlood.issuedAt))}` : ''}
              </small>
            </span>
          </button>
        )}
      </div>

      <div className="sheet-host" ref={hostRef} style={{ bottom: bottomH }}>
        {moved && (tab === 'parking' || tab === 'ev') && snap !== 'full' && (
          <button
            className="area-btn"
            style={{ bottom: sheetH + 12 }}
            onClick={() => {
              store.setPlace({ kind: 'map', label: 'this area', lat: moved.lat, lng: moved.lng });
              setMoved(null);
            }}
          >
            <Icon name="search" size={16} /> Search this area
          </button>
        )}
        {(tab === 'parking' || tab === 'ev') && snap !== 'full' && (
          <button className="fab" style={{ bottom: sheetH + 12 }} onClick={() => void nearMe()} aria-label={here ? 'Back to my location' : 'Use my location'}>
            <Icon name="locate" size={22} />
          </button>
        )}
        {tab === 'weather' && snap !== 'full' && (
          <div className="radar-ctl" style={{ bottom: sheetH + 12 }}>
            {frames.length ? (
              <>
                <button className="play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause radar' : 'Play radar'}>
                  <Icon name={playing && !reduceMotion ? 'pause' : 'playf'} />
                </button>
                <span className="rc-tl">
                  <b>
                    {radarFrame ? clock(Date.parse(radarFrame.at)) : ''} <span>Rain radar · last hour</span>
                  </b>
                  <span className="ticks" role="slider" aria-label="Radar time" aria-valuemin={0} aria-valuemax={frames.length - 1} aria-valuenow={frame}>
                    {frames.map((f, i) => (
                      <button key={f.ts} className={i === frame ? 'c' : i < frame ? 'p' : ''} onClick={() => (setFrame(i), setPlaying(false))} aria-label={clock(Date.parse(f.at))} />
                    ))}
                  </span>
                </span>
                <span className="legend" aria-hidden="true">
                  <i />
                </span>
              </>
            ) : (
              <span className="rc-tl">
                <b>{data.radar.error ? 'Rain radar unavailable' : 'Loading rain radar…'}</b>
              </span>
            )}
          </div>
        )}
        {tab === 'roads' ? (
          <div className="page-host" style={{ top: topH + 6 }}>
            {body}
          </div>
        ) : (
          <BottomSheet
            snap={snap}
            onSnap={(s) => setSnaps((x) => ({ ...x, [tab]: s }))}
            heights={heights}
            header={header}
            pinHeader={tab !== 'weather'}
            label={`${TABS.find((t) => t.id === tab)?.label} panel`}
          >
            {body}
          </BottomSheet>
        )}
      </div>

      <div className="bottom" ref={bottomRef}>
        {parked && (
          <button className="parked-bar" onClick={() => push({ name: 'parked' })}>
            <span className="pi">P</span>
            <span className="tx">
              <b>Parked · {parked.name}</b>
              <small>
                {parked.note ? `${parked.note} · ` : ''}
                {parkedCost != null ? `est. ${money(parkedCost)} so far` : 'Tap for details'}
              </small>
            </span>
            <span className="tm num">{timer((now - parked.startedAt) / 60_000)}</span>
            <Icon name="right" />
          </button>
        )}
        <nav className="nav" aria-label="Main">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`nav-${t.id}${tab === t.id ? ' on' : ''}`}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => {
                setSelected(null);
                setMoved(null);
                setTab(t.id);
              }}
            >
              <span className="nav-ind">
                <Icon name={t.icon} />
              </span>
              <span className="nav-lbl">{t.label}</span>
            </button>
          ))}
        </nav>
        <AdSlot />
      </div>

      {screen}

      {!prefs.onboarded && <Onboarding prefs={prefs} setPrefs={setPrefs} onLocation={data.requestLocation} onDone={() => store.setPlace(null)} />}

      <Sheet open={navFor != null} onClose={() => setNavFor(null)} title="Navigate with">
        <NavChooser onPick={pickNav} />
      </Sheet>
      <ParkSheet
        open={parkTarget != null}
        onClose={() => setParkTarget(null)}
        target={parkTarget ? { ...parkTarget, carpark: parkTarget.carparkId ? store.carparkById.get(parkTarget.carparkId) ?? null : null } : null}
        vehicle={prefs.vehicle}
        leadMin={prefs.reminderLeadMin}
        onSave={(s) => {
          const old = store.parked;
          if (old) void cancelReminders(old.reminders.map((r) => r.notificationId));
          store.setParked(s);
          setParkTarget(null);
          showToast(s.reminders.length ? `Saved · ${plural(s.reminders.length, 'reminder')} set` : 'Parking saved');
        }}
      />
      <Sheet open={longPress != null} onClose={() => setLongPress(null)} title="This spot">
        <h3 className="sheet-h">This spot</h3>
        {longPress && placeAt && <p className="sheet-sub">{formatDistance(distanceM(placeAt, longPress))} from {placeLabel}</p>}
        <div className="opts">
          <button
            className="opt"
            onClick={() => {
              if (longPress) store.setPlace({ kind: 'map', label: 'pinned spot', lat: longPress.lat, lng: longPress.lng });
              setLongPress(null);
            }}
          >
            <Icon name="park" />
            <span>
              <b>Find parking here</b>
            </span>
          </button>
          <button
            className="opt"
            onClick={() => {
              if (longPress) store.savePlace({ label: `Saved spot ${store.places.filter((p) => p.icon === 'star').length + 1}`, icon: 'star', lat: longPress.lat, lng: longPress.lng });
              setLongPress(null);
              showToast('Place saved');
            }}
          >
            <Icon name="staro" />
            <span>
              <b>Save this place</b>
            </span>
          </button>
          <button
            className="opt"
            onClick={() => {
              if (longPress) {
                const near = store.carparks.find((c) => distanceM(c, longPress) < 60);
                setParkTarget({ name: near?.name ?? 'Pinned spot', lat: longPress.lat, lng: longPress.lng, carparkId: near?.id ?? null });
              }
              setLongPress(null);
            }}
          >
            <Icon name="car" />
            <span>
              <b>I've parked here</b>
            </span>
          </button>
        </div>
      </Sheet>
      <Sheet open={alert != null} onClose={() => setAlert(null)} title="Road alert">
        {alert && (
          <>
            <h3 className="sheet-h">{alert.title}</h3>
            <p className="sheet-sub">
              {[`${formatDistance(alert.distanceM)} from ${placeLabel}`, alert.at ? `reported ${clock(Date.parse(alert.at))}` : null].filter(Boolean).join(' · ')}
            </p>
            <p className="inc-msg">{alert.detail}</p>
            <button className="btn block" onClick={() => void openExternal(mapsLink(alert))}>
              <Icon name="map" size={18} /> Show on Google Maps
            </button>
            <p className="d-src">Source: {alert.kind === 'flood' ? 'PUB flood alerts' : alert.kind === 'light' ? 'LTA DataMall faulty traffic lights' : 'LTA DataMall traffic incidents'} (message as published).</p>
          </>
        )}
      </Sheet>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function NavChooser({ onPick }: { onPick: (app: NavTarget, remember: boolean) => void }) {
  const [remember, setRemember] = useState(true);
  return (
    <>
      <h3 className="sheet-h">Navigate with</h3>
      <div className="opts">
        <button className="opt" onClick={() => onPick('google', remember)}>
          <Icon name="navf" />
          <span>
            <b>Google Maps</b>
          </span>
        </button>
        <button className="opt" onClick={() => onPick('waze', remember)}>
          <Icon name="nav" />
          <span>
            <b>Waze</b>
          </span>
        </button>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span>Remember my choice (change it in Settings)</span>
      </label>
    </>
  );
}

let rootBack: () => boolean = () => false;

export function App() {
  return (
    <AppStoreProvider>
      <BackProvider onRootBack={() => rootBack()}>
        <Shell />
      </BackProvider>
    </AppStoreProvider>
  );
}

