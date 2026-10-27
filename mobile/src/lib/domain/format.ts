/** Display formatting. Pure. */
import { sgClock } from './time';

export { money } from './rates';

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** 72 → "1 h 12 min"; 45 → "45 min". */
export function duration(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Compact timer: "42m", "1h 12m". */
export function timer(min: number): string {
  const m = Math.max(0, Math.floor(min));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

/** "just now", "1 min ago", "7 min ago", "2 h ago". */
export function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

export const clock = sgClock;

export function kw(n: number | null): string {
  return n == null ? '' : `${Number.isInteger(n) ? n : n.toFixed(1)} kW`;
}

export function evPrice(p: { amount: number; unit: 'kWh' | 'h' | 'free' } | null): string {
  if (!p) return 'Price not published';
  if (p.unit === 'free' || p.amount === 0) return 'Free';
  return `$${p.amount.toFixed(2)}/${p.unit}`;
}

export const STAY_OPTIONS = [30, 60, 120, 180, 240, 480, 720] as const;
export function stayLabel(min: number): string {
  if (min === 720) return 'Overnight';
  return min < 60 ? `${min} min` : `${min / 60} h`;
}
