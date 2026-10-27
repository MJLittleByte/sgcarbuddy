import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CarparkInfo } from '../../../shared/contract';
import { api, isDemo } from '../lib/api/client';
import { bundledCatalog } from '../lib/api/demo';
import {
  DEFAULT_PREFS,
  loadUserData,
  readCatalog,
  saveItems,
  saveParked,
  savePlace,
  savePlaces,
  savePrefs,
  saveRecents,
  writeCatalog,
  type ParkedSession,
  type Place,
  type Prefs,
  type Recent,
  type SavedItem,
  type SavedPlace,
} from '../lib/storage/store';

/** A chosen place is kept for 2 hours (also across restarts); after that the app opens on "Near you" again. */
export const PLACE_TTL_MS = 2 * 3600_000;
const CATALOG_REFRESH_MS = 24 * 3600_000;

interface Store {
  ready: boolean;
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  places: SavedPlace[];
  savePlace: (p: Omit<SavedPlace, 'id' | 'createdAt'>) => void;
  removePlace: (id: string) => void;
  items: SavedItem[];
  isSaved: (kind: SavedItem['kind'], id: string) => boolean;
  toggleItem: (kind: SavedItem['kind'], id: string, name: string) => void;
  parked: ParkedSession | null;
  setParked: (s: ParkedSession | null) => void;
  recents: Recent[];
  addRecent: (r: Recent) => void;
  clearRecents: () => void;
  /** null = "Near you" (live location). */
  place: Place | null;
  setPlace: (p: Omit<Place, 'setAt'> | null) => void;
  carparks: CarparkInfo[];
  carparkById: Map<string, CarparkInfo>;
  catalogVersion: string;
}

const Ctx = createContext<Store | null>(null);

interface Catalog {
  version: string;
  carparks: CarparkInfo[];
  savedAt: number;
}

async function initialCatalog(): Promise<Catalog> {
  const cached = readCatalog();
  const b = await bundledCatalog();
  const bundledAt = Date.parse(b.builtAt) || 0;
  if (cached && cached.savedAt > bundledAt) return cached;
  return { version: b.version, carparks: b.carparks, savedAt: bundledAt };
}
const EMPTY_CATALOG: Catalog = { version: '', carparks: [], savedAt: 0 };

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [items, setItems] = useState<SavedItem[]>([]);
  const [parked, setParkedState] = useState<ParkedSession | null>(null);
  const [recents, setRecents] = useState<Recent[]>([]);
  const [place, setPlaceState] = useState<Place | null>(null);
  const [catalog, setCatalog] = useState<Catalog>(EMPTY_CATALOG);

  useEffect(() => {
    let alive = true;
    Promise.all([loadUserData(), initialCatalog()]).then(([d, c]) => {
      if (!alive) return;
      setCatalog(c);
      setPrefsState(d.prefs);
      setPlaces(d.places);
      setItems(d.items);
      setParkedState(d.parked);
      setRecents(d.recents);
      setPlaceState(d.place && Date.now() - d.place.setAt < PLACE_TTL_MS ? d.place : null);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Daily catalogue refresh from the Worker (the bundled snapshot covers first launch and offline).
  useEffect(() => {
    if (isDemo || !catalog.version || Date.now() - catalog.savedAt < CATALOG_REFRESH_MS) return;
    let alive = true;
    api
      .catalog()
      .then((c) => {
        if (!alive || c.carparks.length < 1500) return;
        writeCatalog(c.version, c.carparks);
        setCatalog({ version: c.version, carparks: c.carparks, savedAt: Date.now() });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [catalog.savedAt]);

  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    const next = { ...prefsRef.current, ...patch };
    prefsRef.current = next;
    setPrefsState(next);
    void savePrefs(next);
  }, []);

  const carparkById = useMemo(() => new Map(catalog.carparks.map((c) => [c.id, c])), [catalog]);
  const value = useMemo<Store>(() => {
    return {
      ready,
      prefs,
      setPrefs,
      places,
      savePlace: (p) => {
        const next = [...places.filter((x) => !(p.icon !== 'star' && x.icon === p.icon)), { ...p, id: `${Date.now()}`, createdAt: new Date().toISOString() }];
        setPlaces(next);
        void savePlaces(next);
      },
      removePlace: (id) => {
        const next = places.filter((p) => p.id !== id);
        setPlaces(next);
        void savePlaces(next);
      },
      items,
      isSaved: (kind, id) => items.some((i) => i.kind === kind && i.id === id),
      toggleItem: (kind, id, name) => {
        const has = items.some((i) => i.kind === kind && i.id === id);
        const next = has ? items.filter((i) => !(i.kind === kind && i.id === id)) : [...items, { kind, id, name, createdAt: new Date().toISOString() }];
        setItems(next);
        void saveItems(next);
      },
      parked,
      setParked: (s) => {
        setParkedState(s);
        void saveParked(s);
      },
      recents,
      addRecent: (r) => {
        const next = [r, ...recents.filter((x) => x.label !== r.label)].slice(0, 8);
        setRecents(next);
        void saveRecents(next);
      },
      clearRecents: () => {
        setRecents([]);
        void saveRecents([]);
      },
      place,
      setPlace: (p) => {
        const next = p ? { ...p, setAt: Date.now() } : null;
        setPlaceState(next);
        void savePlace(next);
      },
      carparks: catalog.carparks,
      carparkById,
      catalogVersion: catalog.version,
    };
  }, [ready, prefs, setPrefs, places, items, parked, recents, place, catalog, carparkById]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside AppStoreProvider');
  return s;
}
