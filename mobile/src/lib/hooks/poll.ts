import { useCallback, useEffect, useRef, useState } from 'react';
import { readFeed, writeFeed } from '../storage/store';

/** Re-render every `ms` so timers and "x min ago" labels stay current between fetches. */
export function useNow(ms = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    const on = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
}

interface Snapshot<T> {
  data: T;
  at: number;
}

/** Process-wide last-good cache so switching tabs shows the previous data instantly. */
const lastGood = new Map<string, Snapshot<unknown>>();

/** With `persist`, the last good copy also survives an app restart (seeded once from storage). */
function cachedSnapshot<T>(key: string, persist: boolean): Snapshot<T> | undefined {
  if (persist && !lastGood.has(key)) {
    const stored = readFeed<T>(key);
    if (stored) lastGood.set(key, stored);
  }
  return lastGood.get(key) as Snapshot<T> | undefined;
}

/**
 * Next attempt after `failures` failed attempts in a row: the normal interval when all is well; after a failure, a
 * quick retry (15 s, or a quarter of the interval) that doubles up to 4× the interval. Network blips heal in seconds.
 */
export function nextPollIn(intervalMs: number, failures: number): number {
  if (failures === 0) return intervalMs;
  return Math.min(intervalMs * 4, Math.min(15_000, intervalMs / 4) * 2 ** (failures - 1));
}

export interface PollState<T> {
  data: T | null;
  /** When `data` was received on this device (ms). */
  receivedAt: number | null;
  error: Error | null;
  loading: boolean;
  refresh: () => void;
}

/**
 * Fetch `key` now and every `intervalMs` while `enabled` and the app is visible.
 * Disabled polls keep their last data. Errors keep the previous data (marked by `error`), with back-off.
 */
export function usePoll<T>(key: string, fetcher: () => Promise<T>, intervalMs: number, enabled = true, { persist = false }: { persist?: boolean } = {}): PollState<T> {
  const visible = usePageVisible();
  const [state, setState] = useState<{ data: T | null; receivedAt: number | null; error: Error | null; loading: boolean }>(() => {
    const c = cachedSnapshot<T>(key, persist);
    return { data: c?.data ?? null, receivedAt: c?.at ?? null, error: null, loading: enabled };
  });
  const persistRef = useRef(persist);
  persistRef.current = persist;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const [tick, setTick] = useState(0);
  const force = useRef(false);
  const refresh = useCallback(() => {
    force.current = true;
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const c = lastGood.get(key) as Snapshot<T> | undefined;
    if (c) setState((s) => (s.receivedAt === c.at ? s : { data: c.data, receivedAt: c.at, error: null, loading: false }));
  }, [key]);

  useEffect(() => {
    if (!enabled || !visible) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const run = async () => {
      setState((s) => ({ ...s, loading: true }));
      try {
        const data = await fetcherRef.current();
        if (cancelled) return;
        failures = 0;
        const at = Date.now();
        lastGood.set(key, { data, at });
        if (persistRef.current) writeFeed(key, data, at);
        setState({ data, receivedAt: at, error: null, loading: false });
      } catch (e) {
        if (cancelled) return;
        failures++;
        setState((s) => ({ ...s, error: e instanceof Error ? e : new Error(String(e)), loading: false }));
      }
      if (!cancelled) timer = setTimeout(run, nextPollIn(intervalMs, failures));
    };
    // Don't refetch on every re-enable if the data is still fresh (tab switching).
    const c = lastGood.get(key);
    const age = c ? Date.now() - c.at : Infinity;
    if (!force.current && age < intervalMs) timer = setTimeout(run, intervalMs - age);
    else void run();
    force.current = false;
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [key, visible, intervalMs, tick, enabled]);

  return { ...state, refresh };
}
