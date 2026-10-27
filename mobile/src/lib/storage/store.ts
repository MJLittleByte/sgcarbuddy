import { Preferences } from '@capacitor/preferences';
import type { Agency, CarparkInfo, PlugKind } from '../../../../shared/contract';
import { DATA_SOURCE, isDemo } from '../api/client';
import type { Vehicle } from '../domain/rates';

export const SCHEMA_VERSION = 1;

/** Auto follows the phone; Day = concept A (Kerb) look, Night = concept C (Night Drive) look. Same layout. */
export type ThemePref = 'auto' | 'day' | 'night';
export type NavApp = 'google' | 'waze' | 'ask';
export type SortBy = 'nearest' | 'space' | 'cheapest';

export interface ParkFilters {
  hasSpace: boolean;
  covered: boolean;
  freeNow: boolean;
  night: boolean;
  electronic: boolean;
  /** Hide HDB carparks that are season parking only (default on). */
  hideSeasonOnly: boolean;
  /** Only carparks with a published gantry height of at least this (metres); 0 = any. */
  minHeightM: number;
  agencies: Agency[];
}

export interface EvFilters {
  availableNow: boolean;
  dcOnly: boolean;
  minKw: number;
  operators: string[];
}

export interface Prefs {
  theme: ThemePref;
  vehicle: Vehicle;
  /** EV plugs (from the vehicle profile). */
  plugs: PlugKind[];
  showEvTab: boolean;
  navApp: NavApp;
  walkingPaceMpm: number;
  stayMin: number;
  sort: SortBy;
  parkFilters: ParkFilters;
  evFilters: EvFilters;
  reminderLeadMin: number;
  onboarded: boolean;
}

export const DEFAULT_PARK_FILTERS: ParkFilters = {
  hasSpace: false,
  covered: false,
  freeNow: false,
  night: false,
  electronic: false,
  hideSeasonOnly: true,
  minHeightM: 0,
  agencies: [],
};
export const DEFAULT_EV_FILTERS: EvFilters = { availableNow: false, dcOnly: false, minKw: 0, operators: [] };

export const DEFAULT_PREFS: Prefs = {
  theme: 'auto',
  vehicle: 'car',
  plugs: ['type2', 'ccs2'],
  showEvTab: false,
  navApp: 'ask',
  walkingPaceMpm: 75,
  stayMin: 120,
  sort: 'nearest',
  parkFilters: DEFAULT_PARK_FILTERS,
  evFilters: DEFAULT_EV_FILTERS,
  reminderLeadMin: 10,
  onboarded: false,
};

export interface SavedPlace {
  id: string;
  label: string;
  icon: 'home' | 'work' | 'star';
  lat: number;
  lng: number;
  address?: string;
  createdAt: string;
}

export interface SavedItem {
  kind: 'carpark' | 'charger';
  id: string;
  /** Name at the time of saving, shown if the item disappears from the feed. */
  name: string;
  createdAt: string;
}

export interface Reminder {
  kind: 'free-ends' | 'free-starts' | 'up' | 'down' | 'night-cap' | 'custom';
  /** When the notification fires (ms). */
  at: number;
  /** The event it warns about (ms). */
  eventAt: number;
  label: string;
  notificationId: number;
}

export interface ParkedSession {
  carparkId?: string;
  name: string;
  lat: number;
  lng: number;
  startedAt: number;
  note?: string;
  reminders: Reminder[];
}

/** The place every tab is about: your location, or a chosen place. */
export interface Place {
  kind: 'near-me' | 'search' | 'saved' | 'map' | 'carpark';
  label: string;
  lat: number;
  lng: number;
  setAt: number;
}

export interface Recent {
  label: string;
  sub?: string;
  lat: number;
  lng: number;
}

export interface UserData {
  prefs: Prefs;
  places: SavedPlace[];
  items: SavedItem[];
  parked: ParkedSession | null;
  recents: Recent[];
  place: Place | null;
}

const P = isDemo ? 'scb.demo.' : 'scb.';
const K = {
  version: 'scb.schemaVersion',
  prefs: 'scb.prefs',
  places: `${P}places`,
  items: `${P}items`,
  parked: `${P}parked`,
  recents: `${P}recents`,
  place: `${P}place`,
  catalog: 'scb.catalog',
  feed: 'scb.feed.',
};

async function readJson<T>(key: string): Promise<T | null> {
  const { value } = await Preferences.get({ key });
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/** Versioned load; future schema changes add a migration step here instead of dropping saved data. */
export async function loadUserData(): Promise<UserData> {
  const version = Number((await Preferences.get({ key: K.version })).value ?? SCHEMA_VERSION);
  if (version > SCHEMA_VERSION) console.warn('Local data is from a newer app version; reading what we understand.');
  const saved = (await readJson<Partial<Prefs>>(K.prefs)) ?? {};
  const prefs: Prefs = {
    ...DEFAULT_PREFS,
    ...saved,
    parkFilters: { ...DEFAULT_PARK_FILTERS, ...(saved.parkFilters ?? {}) },
    evFilters: { ...DEFAULT_EV_FILTERS, ...(saved.evFilters ?? {}) },
  };
  await Preferences.set({ key: K.version, value: String(SCHEMA_VERSION) });
  return {
    prefs,
    places: (await readJson<SavedPlace[]>(K.places)) ?? [],
    items: (await readJson<SavedItem[]>(K.items)) ?? [],
    parked: await readJson<ParkedSession>(K.parked),
    recents: (await readJson<Recent[]>(K.recents)) ?? [],
    place: await readJson<Place>(K.place),
  };
}

const write = (key: string, v: unknown) => (v == null ? Preferences.remove({ key }) : Preferences.set({ key, value: JSON.stringify(v) }));
export const savePrefs = (v: Prefs) => write(K.prefs, v);
export const savePlaces = (v: SavedPlace[]) => write(K.places, v);
export const saveItems = (v: SavedItem[]) => write(K.items, v);
export const saveParked = (v: ParkedSession | null) => write(K.parked, v);
export const saveRecents = (v: Recent[]) => write(K.recents, v);
export const savePlace = (v: Place | null) => write(K.place, v);

/** The carpark catalogue is cache, not user data, so localStorage is fine (re-downloadable, and bundled). */
export function readCatalog(): { version: string; carparks: CarparkInfo[]; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(K.catalog);
    const c = raw ? (JSON.parse(raw) as { source?: string; version: string; carparks: CarparkInfo[]; savedAt: number }) : null;
    return c && c.source === DATA_SOURCE ? c : null;
  } catch {
    return null;
  }
}

/**
 * Last good copy of a live feed (carpark availability), so reopening the app with no signal (say, in a basement)
 * still shows recent counts. Counts older than 15 minutes are hidden by the app anyway. Cache, not user data.
 */
export function readFeed<T>(key: string): { data: T; at: number } | null {
  try {
    const raw = localStorage.getItem(K.feed + key);
    const c = raw ? (JSON.parse(raw) as { source?: string; data: T; at: number }) : null;
    return c && c.source === DATA_SOURCE && Number.isFinite(c.at) ? { data: c.data, at: c.at } : null;
  } catch {
    return null;
  }
}

export function writeFeed(key: string, data: unknown, at: number) {
  try {
    localStorage.setItem(K.feed + key, JSON.stringify({ source: DATA_SOURCE, data, at }));
  } catch {
    /* quota: live data still works, just not across restarts */
  }
}

export function writeCatalog(version: string, carparks: CarparkInfo[]) {
  if (isDemo) return;
  try {
    localStorage.setItem(K.catalog, JSON.stringify({ source: DATA_SOURCE, version, carparks, savedAt: Date.now() }));
  } catch {
    /* quota: the bundled snapshot still works */
  }
}
