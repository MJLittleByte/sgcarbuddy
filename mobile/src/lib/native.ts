/**
 * Native bridges with web fallbacks: open other apps (Google Maps / Waze), share, local notifications.
 * Nothing here sends data anywhere except where the user explicitly hands off (navigate, share).
 */
import { AppLauncher } from '@capacitor/app-launcher';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';
import type { LatLng } from './domain/geo';

export const isNative = Capacitor.isNativePlatform();

export async function openExternal(url: string): Promise<void> {
  if (isNative) {
    try {
      await AppLauncher.openUrl({ url });
      return;
    } catch {
      /* fall through */
    }
  }
  window.open(url, '_blank', 'noopener');
}

export type NavTarget = 'google' | 'waze';

/** Hand-off navigation URLs (no API key; the target app does the routing). */
export function navigationUrl(app: NavTarget, to: LatLng, mode: 'driving' | 'walking' = 'driving'): string {
  if (app === 'waze' && mode === 'driving') return `https://waze.com/ul?ll=${to.lat.toFixed(6)},${to.lng.toFixed(6)}&navigate=yes`;
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat.toFixed(6)},${to.lng.toFixed(6)}&travelmode=${mode}`;
}

export const mapsLink = (to: LatLng) => `https://www.google.com/maps/search/?api=1&query=${to.lat.toFixed(6)},${to.lng.toFixed(6)}`;

export async function shareText(title: string, text: string, url?: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (isNative) {
      await Share.share({ title, text, url, dialogTitle: title });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return 'shared';
    }
    await navigator.clipboard.writeText([text, url].filter(Boolean).join('\n'));
    return 'copied';
  } catch {
    return 'failed';
  }
}

/* ---------------- Local notifications (parked reminders) ---------------- */

export type NotifyState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export async function notifyPermission(): Promise<NotifyState> {
  try {
    if (isNative) {
      const p = await LocalNotifications.checkPermissions();
      return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt';
    }
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission === 'granted' ? 'granted' : Notification.permission === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'unsupported';
  }
}

export async function requestNotify(): Promise<NotifyState> {
  try {
    if (isNative) {
      const p = await LocalNotifications.requestPermissions();
      return p.display === 'granted' ? 'granted' : 'denied';
    }
    if (typeof Notification === 'undefined') return 'unsupported';
    const r = await Notification.requestPermission();
    return r === 'granted' ? 'granted' : r === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'unsupported';
  }
}

/** Exact alarms are off by default on Android 14+: reminders may then arrive a few minutes late. */
export async function exactAlarmsAllowed(): Promise<boolean | null> {
  if (!isNative) return null;
  try {
    const s = await LocalNotifications.checkExactNotificationSetting();
    return s.exact_alarm === 'granted';
  } catch {
    return null;
  }
}

export async function openExactAlarmSettings(): Promise<void> {
  if (isNative) await LocalNotifications.changeExactNotificationSetting().catch(() => {});
}

const webTimers = new Map<number, number>();

export async function scheduleReminders(list: Array<{ id: number; at: number; title: string; body: string }>): Promise<void> {
  const future = list.filter((n) => n.at > Date.now() + 5_000);
  if (!future.length) return;
  if (isNative) {
    await LocalNotifications.schedule({
      notifications: future.map((n) => ({ id: n.id, title: n.title, body: n.body, schedule: { at: new Date(n.at), allowWhileIdle: true } })),
    });
    return;
  }
  // Web (development): best effort while the tab stays open.
  for (const n of future) {
    const t = window.setTimeout(() => {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(n.title, { body: n.body });
    }, Math.min(n.at - Date.now(), 2_147_000_000));
    webTimers.set(n.id, t);
  }
}

export async function cancelReminders(ids: number[]): Promise<void> {
  if (!ids.length) return;
  if (isNative) {
    await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) }).catch(() => {});
    return;
  }
  for (const id of ids) {
    window.clearTimeout(webTimers.get(id));
    webTimers.delete(id);
  }
}
