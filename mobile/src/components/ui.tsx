import type { ReactNode } from 'react';
import { describeError, isDemo } from '../lib/api/client';
import type { Level, Lots } from '../lib/domain/availability';
import { ago } from '../lib/domain/format';
import { Icon, type IconName } from './Icon';

/** Free lots block: big number, "of total", fill bar. Colour + number + words (encoded twice). */
export function LotsBlock({ lots, unit = 'free' }: { lots: Lots; unit?: string }) {
  const pct = lots.free != null && lots.total ? Math.max(0.04, Math.min(1, lots.free / lots.total)) : null;
  return (
    <span className={`lots lv-${lots.level}`} aria-hidden="true">
      <b>{lots.free == null ? '—' : lots.free > 999 ? '999+' : lots.free}</b>
      <small>{lots.free == null ? (lots.why === 'not-reported' ? 'not counted' : 'no data') : lots.total ? `of ${lots.total}` : unit}</small>
      {pct != null && (
        <span className="bar">
          <i style={{ width: `${pct * 100}%` }} />
        </span>
      )}
    </span>
  );
}

export function lotsPhrase(lots: Lots, vehicleWord: string): string {
  if (lots.free == null) return lots.why === 'not-reported' ? `${vehicleWord} lots aren't counted live here` : `No live data for ${vehicleWord} lots`;
  if (lots.free === 0) return `Full, no ${vehicleWord} lots free`;
  return `${lots.free} ${vehicleWord} lots free${lots.total ? ` of ${lots.total}` : ''}`;
}

export function LevelDot({ level }: { level: Level }) {
  return <i className={`ldot lv-${level}`} aria-hidden="true" />;
}

/** "● Live · updated 1 min ago" or muted "Updated 9 min ago · Retry". */
export function Fresh({ at, now, staleAfterMs, error, onRetry, prefix = isDemo ? 'Sample data' : 'Live' }: { at: number | null; now: number; staleAfterMs: number; error?: Error | null; onRetry?: () => void; prefix?: string }) {
  if (!at) {
    return (
      <span className={`fresh muted${error ? ' err' : ''}`}>
        {error ? describeError(error) : 'Loading…'}
        {error && onRetry && <button onClick={onRetry}>Retry</button>}
      </span>
    );
  }
  const stale = now - at > staleAfterMs || Boolean(error);
  return (
    <span className={`fresh${stale ? ' muted' : ''}`}>
      {!stale && <i className="live" aria-hidden="true" />}
      {stale ? `Updated ${ago(at, now)}${error ? ` · ${describeError(error)}` : ''}` : `${prefix} · updated ${ago(at, now)}`}
      {stale && onRetry && (
        <button onClick={onRetry} aria-label="Retry now">
          Retry
        </button>
      )}
    </span>
  );
}

export function Chip({ on, icon, children, onClick, badge, label }: { on?: boolean; icon?: IconName; children?: ReactNode; onClick?: () => void; badge?: number; label?: string }) {
  return (
    <button className={`ctl${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick} aria-label={label}>
      {icon && <Icon name={icon} size={15} />}
      {children}
      {badge ? <em>{badge}</em> : null}
    </button>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} className={`switch${on ? ' on' : ''}`} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ id: T; label: string; icon?: IconName }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.icon && <Icon name={o.icon} size={16} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ScreenHeader({ title, onBack, actions }: { title: string; onBack: () => void; actions?: ReactNode }) {
  return (
    <header className="scr-head">
      <button className="ib" onClick={onBack} aria-label="Back">
        <Icon name="left" size={22} />
      </button>
      <h1>{title}</h1>
      <span className="scr-actions">{actions}</span>
    </header>
  );
}

export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-ic">
        <Icon name={icon} size={26} />
      </span>
      <b>{title}</b>
      {children}
    </div>
  );
}
