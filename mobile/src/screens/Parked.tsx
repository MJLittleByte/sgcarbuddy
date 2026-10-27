import { useEffect, useMemo, useState } from 'react';
import type { CarparkInfo } from '../../../shared/contract';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { Empty, ScreenHeader } from '../components/ui';
import { clock, duration, money, timer } from '../lib/domain/format';
import { estimateCost, rateChanges, type Vehicle } from '../lib/domain/rates';
import { cancelReminders, exactAlarmsAllowed, notifyPermission, openExactAlarmSettings, requestNotify, scheduleReminders, type NotifyState } from '../lib/native';
import type { ParkedSession, Reminder } from '../lib/storage/store';

const STARTS = [
  { id: 0, label: 'Just now' },
  { id: 15, label: '15 min ago' },
  { id: 30, label: '30 min ago' },
  { id: 60, label: '1 h ago' },
];
const CUSTOM = [0, 60, 120, 180, 240];

let nextId = Math.floor(Date.now() / 1000) % 100_000;

/** "I've parked": note, start time and honest reminders (only rule changes that apply to this carpark). */
export function ParkSheet({
  open,
  onClose,
  target,
  vehicle,
  leadMin,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  target: { name: string; lat: number; lng: number; carpark: CarparkInfo | null } | null;
  vehicle: Vehicle;
  leadMin: number;
  onSave: (s: ParkedSession) => void;
}) {
  const [note, setNote] = useState('');
  const [ago, setAgo] = useState(0);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [custom, setCustom] = useState(0);
  const [perm, setPerm] = useState<NotifyState>('prompt');
  const start = useMemo(() => Date.now() - ago * 60_000, [ago, open]);
  const changes = useMemo(() => (target?.carpark ? rateChanges(target.carpark, vehicle, start, 12 * 60).filter((c) => c.at - leadMin * 60_000 > Date.now()).slice(0, 4) : []), [target, vehicle, start, leadMin]);

  useEffect(() => {
    if (!open) return;
    setNote('');
    setAgo(0);
    setCustom(0);
    void notifyPermission().then(setPerm);
  }, [open]);
  useEffect(() => {
    setPicked(new Set(changes.map((c, i) => (c.kind === 'free-ends' || c.kind === 'up' ? i : -1)).filter((i) => i >= 0)));
  }, [changes]);

  if (!target) return null;
  const save = async () => {
    const reminders: Reminder[] = [];
    changes.forEach((c, i) => {
      if (picked.has(i)) reminders.push({ kind: c.kind, at: c.at - leadMin * 60_000, eventAt: c.at, label: c.label, notificationId: ++nextId });
    });
    if (custom) {
      const at = start + custom * 60_000;
      reminders.push({ kind: 'custom', at, eventAt: at, label: `${duration(custom)} since you parked`, notificationId: ++nextId });
    }
    let p = perm;
    if (reminders.length && p !== 'granted') p = await requestNotify();
    if (reminders.length && p === 'granted') {
      await scheduleReminders(
        reminders.map((r) => ({
          id: r.notificationId,
          at: r.at,
          title: r.kind === 'custom' ? 'Parking reminder' : r.label.replace(/ at .*$/, ` in ${leadMin} min`),
          body: `${target.name}${note ? ` · ${note}` : ''}. ${r.kind === 'custom' ? r.label : r.label}.`,
        })),
      ).catch(() => {});
    }
    onSave({ carparkId: target.carpark?.id, name: target.name, lat: target.lat, lng: target.lng, startedAt: start, note: note.trim() || undefined, reminders: p === 'granted' ? reminders : [] });
  };

  return (
    <Sheet open={open} onClose={onClose} title="I've parked">
      <h3 className="sheet-h">I've parked</h3>
      <p className="sheet-sub">{target.name}</p>
      <label className="field">
        <span>Deck / lot (optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 4B, near lift C" maxLength={60} />
      </label>
      <h4 className="set-h">Parked</h4>
      <div className="pills">
        {STARTS.map((s) => (
          <button key={s.id} className={`pill${ago === s.id ? ' on' : ''}`} onClick={() => setAgo(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <h4 className="set-h">Remind me {leadMin} min before</h4>
      {changes.length === 0 && <p className="list-note">{target.carpark ? 'No rate changes in the next 12 hours.' : 'No published rates for this spot.'}</p>}
      <div className="set-card">
        {changes.map((c, i) => (
          <label key={c.at + c.kind} className="check-row">
            <input
              type="checkbox"
              checked={picked.has(i)}
              onChange={(e) => {
                const n = new Set(picked);
                if (e.target.checked) n.add(i);
                else n.delete(i);
                setPicked(n);
              }}
            />
            <span>{c.label}</span>
          </label>
        ))}
      </div>
      <h4 className="set-h">And also after</h4>
      <div className="pills">
        {CUSTOM.map((m) => (
          <button key={m} className={`pill${custom === m ? ' on' : ''}`} onClick={() => setCustom(m)}>
            {m ? duration(m) : 'No'}
          </button>
        ))}
      </div>
      {perm === 'denied' && <p className="d-warn">Notifications are blocked for this app, so reminders can't be shown. You can turn them on in your phone's settings.</p>}
      <button className="btn primary block" onClick={save}>
        <Icon name="park" size={18} /> Save parking
      </button>
    </Sheet>
  );
}

export function ParkedScreen({
  parked,
  carpark,
  vehicle,
  now,
  onBack,
  onWalk,
  onDone,
  onOpenCarpark,
}: {
  parked: ParkedSession | null;
  carpark: CarparkInfo | null;
  vehicle: Vehicle;
  now: number;
  onBack: () => void;
  onWalk: () => void;
  onDone: () => void;
  onOpenCarpark: (id: string) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [exact, setExact] = useState<boolean | null>(null);
  useEffect(() => void exactAlarmsAllowed().then(setExact), []);
  if (!parked) {
    return (
      <div className="screen">
        <ScreenHeader title="Parked car" onBack={onBack} />
        <Empty icon="park" title="You haven't saved a parking spot">
          <p>Open a carpark and tap "I've parked here".</p>
        </Empty>
      </div>
    );
  }
  const mins = (now - parked.startedAt) / 60_000;
  const est = carpark ? estimateCost(carpark, vehicle, parked.startedAt, mins) : null;
  const upcoming = parked.reminders.filter((r) => r.at > now).sort((a, b) => a.at - b.at);
  const finish = async () => {
    await cancelReminders(parked.reminders.map((r) => r.notificationId));
    onDone();
  };
  return (
    <div className="screen parked-scr">
      <ScreenHeader title="Parked car" onBack={onBack} />
      <div className="scr-body">
        <section className="pk-hero">
          <span className="pk-p">P</span>
          <b className="pk-timer num">{timer(mins)}</b>
          <small>since {clock(parked.startedAt)}</small>
          {est && est.amount != null && (
            <span className="pk-cost">
              est. <b>{money(est.amount)}</b> so far
            </span>
          )}
          {est && est.amount == null && est.note && <small>{est.note}</small>}
        </section>
        <section className="d-sec">
          <h2>Where</h2>
          <button className="d-ev" onClick={() => parked.carparkId && onOpenCarpark(parked.carparkId)} disabled={!parked.carparkId}>
            <Icon name="park" />
            <span>
              <b>{parked.name}</b>
              <small>{parked.note ?? 'No deck or lot noted'}</small>
            </span>
            {parked.carparkId && <Icon name="right" />}
          </button>
          <div className="d-actions">
            <button className="btn primary" onClick={onWalk}>
              <Icon name="walk" size={18} /> Walk to my car
            </button>
          </div>
        </section>
        <section className="d-sec">
          <h2>Reminders</h2>
          {!upcoming.length && <p className="list-note">No upcoming reminders.</p>}
          <ul className="d-list">
            {upcoming.map((r) => (
              <li key={r.notificationId}>
                {clock(r.at)}: {r.label}
              </li>
            ))}
          </ul>
          {exact === false && upcoming.length > 0 && (
            <p className="d-note">
              Reminders may arrive a few minutes late because exact alarms are off.{' '}
              <button className="link" onClick={() => void openExactAlarmSettings()}>
                Allow exact alarms
              </button>
            </p>
          )}
          {est && est.basis.length > 0 && <p className="d-src">Estimate basis: {est.basis.join(' · ')}.</p>}
        </section>
        <button className="btn danger block" onClick={() => setConfirm(true)}>
          Done parking
        </button>
      </div>
      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Done parking?">
        <h3 className="sheet-h">Done parking?</h3>
        <p className="sheet-sub">
          {duration(mins)}
          {est?.amount != null ? `, about ${money(est.amount)}` : ''}. Reminders will be cancelled.
        </p>
        <button className="btn danger block" onClick={finish}>
          Done parking
        </button>
        <button className="btn block" onClick={() => setConfirm(false)}>
          Keep parked
        </button>
      </Sheet>
    </div>
  );
}
