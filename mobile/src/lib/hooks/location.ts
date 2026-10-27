import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { useCallback, useEffect, useState } from 'react';
import { isDemo } from '../api/client';
import { DEMO_LOCATION } from '../api/demo';
import { distanceM, type LatLng } from '../domain/geo';

export type LocationStatus = 'checking' | 'prompt' | 'granted' | 'denied' | 'unavailable';

export interface LocationState {
  here: LatLng | null;
  status: LocationStatus;
  /** true when `here` is the demo fallback rather than the device position. */
  isDemoLocation: boolean;
  /** Ask for permission (only ever called from a user tap). */
  request: () => Promise<void>;
}

let shared: { here: LatLng | null; at: number } = { here: null, at: 0 };
const listeners = new Set<() => void>();

async function readPosition(): Promise<LatLng | null> {
  try {
    const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10_000, maximumAge: 120_000 });
    return { lat: p.coords.latitude, lng: p.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * Current location, used on the phone only (Explore walk minutes, rain matching).
 * Never prompts on launch: permission is requested only from an explicit user action.
 */
export function useLocation(): LocationState {
  const [status, setStatus] = useState<LocationStatus>('checking');
  const [, force] = useState(0);

  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);

  const update = useCallback(async () => {
    const here = await readPosition();
    if (!here) return false;
    // Only notify when moved > 50 m, to avoid churning every consumer.
    if (!shared.here || distanceM(shared.here, here) > 50) {
      shared = { here, at: Date.now() };
      listeners.forEach((l) => l());
    }
    return true;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const perm = await Geolocation.checkPermissions();
        const s = perm.coarseLocation === 'granted' || perm.location === 'granted' ? 'granted' : perm.location === 'denied' ? 'denied' : 'prompt';
        if (!alive) return;
        setStatus(s);
        if (s === 'granted') await update();
      } catch {
        if (alive) setStatus(Capacitor.isNativePlatform() ? 'unavailable' : 'prompt');
      }
    })();
    const id = setInterval(() => status === 'granted' && update(), 120_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [update, status]);

  const request = useCallback(async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const r = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
        const ok = r.location === 'granted' || r.coarseLocation === 'granted';
        setStatus(ok ? 'granted' : 'denied');
        if (ok) await update();
      } else {
        // Browsers prompt on first use.
        const ok = await update();
        setStatus(ok ? 'granted' : 'denied');
      }
    } catch {
      setStatus('denied');
    }
  }, [update]);

  const useDemo = isDemo && !shared.here;
  return { here: shared.here ?? (useDemo ? DEMO_LOCATION : null), status, isDemoLocation: useDemo, request };
}
