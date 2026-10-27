import { App as CapApp } from '@capacitor/app';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ThemePref } from '../lib/storage/store';

/* ---------------- Theme ---------------- */

function systemDark(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Applies the resolved theme (Day = light, Night = dark) to <html data-theme> and the Android system bars. */
export function useResolvedTheme(pref: ThemePref): 'light' | 'dark' {
  const [sys, setSys] = useState(systemDark);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSys(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const theme = pref === 'auto' ? (sys ? 'dark' : 'light') : pref === 'night' ? 'dark' : 'light';
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]:not([media])')?.remove();
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = theme === 'dark' ? '#060a14' : '#f3f5f8';
    document.head.appendChild(meta);
    if (Capacitor.isNativePlatform()) {
      // DARK = light icons on a dark background.
      void SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
    }
  }, [theme]);
  return theme;
}

/** The theme currently applied to <html data-theme> (for components that draw their own colours). */
export function useAppliedTheme(): 'light' | 'dark' {
  const read = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const [theme, setTheme] = useState<'light' | 'dark'>(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return theme;
}

/* ---------------- Back navigation (Android back button + in-app back) ---------------- */

type Handler = () => boolean;
const BackCtx = createContext<{ register: (h: Handler) => () => void } | null>(null);

/** Handlers run newest-first; the first that returns true consumes the back press. */
export function BackProvider({ children, onRootBack }: { children: ReactNode; onRootBack: () => boolean }) {
  const stack = useRef<Handler[]>([]);
  const root = useRef(onRootBack);
  root.current = onRootBack;

  const register = useCallback((h: Handler) => {
    stack.current.push(h);
    return () => {
      stack.current = stack.current.filter((x) => x !== h);
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const sub = CapApp.addListener('backButton', () => {
      for (let i = stack.current.length - 1; i >= 0; i--) if (stack.current[i]!()) return;
      if (!root.current()) void CapApp.exitApp();
    });
    return () => void sub.then((s) => s.remove());
  }, []);

  return <BackCtx.Provider value={{ register }}>{children}</BackCtx.Provider>;
}

/** Register a back handler while `active`. */
export function useBackHandler(active: boolean, handler: () => void) {
  const ctx = useContext(BackCtx);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active || !ctx) return;
    return ctx.register(() => {
      ref.current();
      return true;
    });
  }, [active, ctx]);
}
