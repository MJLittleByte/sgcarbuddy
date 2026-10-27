/**
 * Building blocks of the carpark detail screen: the live-lots hero, the price card, the rate sheet and the facts grid.
 * Every number that matters is shown big, in colour and in words (never colour alone).
 */
import type { CarparkInfo } from '../../../shared/contract';
import { isCovered } from '../../../shared/carparks';
import { Icon, type IconName } from '../components/Icon';
import { Fresh } from '../components/ui';
import { AVAILABILITY_STALE_MS, levelWord, type Lots } from '../lib/domain/availability';
import { money, STAY_OPTIONS, stayLabel } from '../lib/domain/format';
import { HDB_PEAK, type CostEstimate, type RateSheet, type Vehicle } from '../lib/domain/rates';

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'ev' | 'muted';

/* ---------------- Highlights under the title ---------------- */

export function highlights(cp: CarparkInfo, vehicle: Vehicle, evCount: number): Array<{ icon: IconName; text: string; tone: Tone }> {
  const out: Array<{ icon: IconName; text: string; tone: Tone }> = [];
  if (cp.agency === 'HDB' && cp.shortTerm === 'no') out.push({ icon: 'x', text: 'Season parking only', tone: 'bad' });
  if (cp.shortTerm === '7am-10.30pm' || cp.shortTerm === '7am-7pm') out.push({ icon: 'clock', text: `Visitors ${cp.shortTerm === '7am-7pm' ? '7am–7pm' : '7am–10:30pm'}`, tone: 'warn' });
  if (cp.type && isCovered(cp)) out.push({ icon: 'umbrella', text: 'Covered', tone: 'good' });
  if (cp.freeParking && vehicle !== 'motorcycle') out.push({ icon: 'sun', text: `Free Sun & PH${cp.freeParking === 'sun-ph-1pm' ? ' from 1pm' : ''}`, tone: 'good' });
  if (cp.agency === 'HDB' && cp.code in HDB_PEAK && vehicle !== 'motorcycle') out.push({ icon: 'clock', text: 'Peak-hour pricing', tone: 'warn' });
  else if (cp.central && vehicle !== 'motorcycle') out.push({ icon: 'alert', text: 'Central Area rates', tone: 'warn' });
  if (cp.heightM) out.push({ icon: 'height', text: `${cp.heightM} m height limit`, tone: cp.heightM < 2.1 ? 'bad' : 'warn' });
  if (evCount > 0) out.push({ icon: 'boltf', text: 'EV charging', tone: 'ev' });
  return out;
}

/* ---------------- Live lots ---------------- */

const VEH_ICON: Record<'car' | 'motorcycle', IconName> = { car: 'car', motorcycle: 'moto' };

export function LotsHero({
  lots,
  other,
  vw,
  fetchedAt,
  now,
  error,
  onRetry,
}: {
  lots: Lots;
  other: Lots;
  vw: 'car' | 'motorcycle';
  fetchedAt: number | null;
  now: number;
  error: Error | null;
  onRetry: () => void;
}) {
  const ow = vw === 'car' ? 'motorcycle' : 'car';
  const fresh = <Fresh at={fetchedAt} now={now} staleAfterMs={5 * 60_000} error={error} onRetry={onRetry} />;

  if (lots.free != null) {
    const pct = lots.total ? Math.max(0.03, Math.min(1, lots.free / lots.total)) : null;
    return (
      <section className={`d-hero lv-${lots.level}`} aria-label={`${lots.free} ${vw} lots free${lots.total ? ` of ${lots.total}` : ''}. ${levelWord[lots.level]}.`}>
        <div className="d-hero-row">
          <span className="d-hero-num">
            <b>{lots.free > 999 ? '999+' : lots.free}</b>
            <small>{vw} lots free</small>
          </span>
          <span className="d-hero-side">
            <span className="d-level">
              <i aria-hidden="true" />
              {levelWord[lots.level]}
            </span>
            {lots.total ? <small>of {lots.total} lots</small> : null}
          </span>
        </div>
        {pct != null && (
          <span className="d-hero-bar" aria-hidden="true">
            <i style={{ width: `${pct * 100}%` }} />
          </span>
        )}
        <footer className="d-hero-foot">
          {fresh}
          {other.free != null && (
            <span className="d-other">
              <Icon name={VEH_ICON[ow]} size={15} /> {other.free} {ow} free
            </span>
          )}
        </footer>
      </section>
    );
  }

  // No number for my vehicle: say exactly why.
  let icon: IconName = 'info';
  let title = '';
  let text = '';
  if (lots.why === 'not-reported') {
    icon = VEH_ICON[vw];
    title = `No live count for ${vw} lots`;
    text =
      other.free != null
        ? `This carpark only reports ${ow} lots live (${other.free}${other.total ? ` of ${other.total}` : ''} free). ${vw === 'motorcycle' ? 'Motorcycle' : 'Car'} lots may still be available.`
        : `This carpark doesn't report ${vw} lots live.`;
  } else if (lots.why === 'not-listed') {
    title = 'No live count for this carpark';
    text = "It isn't in LTA's live availability feed. Check the signs at the entrance.";
  } else if (lots.why === 'stale') {
    icon = 'clock';
    title = 'Live count is out of date';
    text = `Counts older than ${AVAILABILITY_STALE_MS / 60_000} min are hidden, so you don't drive to a full carpark. We'll keep trying.`;
  } else {
    icon = error ? 'alert' : 'refresh';
    title = error ? "Can't load live lots" : 'Getting live lots…';
    text = error ? "We'll keep trying in the background." : '';
  }
  return (
    <section className="d-hero lv-none" aria-label={`${title}. ${text}`}>
      <div className="d-hero-row">
        <span className="d-hero-ic">
          <Icon name={icon} size={24} />
        </span>
        <span className="d-hero-msg">
          <b>{title}</b>
          {text && <small>{text}</small>}
        </span>
      </div>
      {(fetchedAt || error) && <footer className="d-hero-foot">{fresh}</footer>}
    </section>
  );
}

/* ---------------- Price ---------------- */

export function PriceCard({
  est,
  nowLabel,
  stayMin,
  onStay,
  emptyNote,
}: {
  est: CostEstimate;
  /** "Free now" / "Now $0.60 / 30 min" / null. */
  nowLabel: { text: string; free: boolean } | null;
  stayMin: number;
  onStay: (min: number) => void;
  emptyNote?: string;
}) {
  const capped = est.basis.filter((b) => b.startsWith('Capped'));
  return (
    <section className="d-card d-price" aria-labelledby="d-price-h">
      <header className="d-card-head">
        <h2 id="d-price-h">Parking fee</h2>
        {nowLabel && <span className={`d-now${nowLabel.free ? ' free' : ''}`}>{nowLabel.text}</span>}
      </header>
      {est.amount != null ? (
        <p className="d-est">
          <b>{money(est.amount)}</b>
          <span>
            estimated for a <strong>{stayLabel(stayMin).replace('Overnight', 'overnight')}</strong> stay
            <br />
            starting now
          </span>
        </p>
      ) : (
        <p className="d-est none">
          <Icon name="info" size={18} />
          <span>{est.note ?? emptyNote ?? 'No published rate.'}</span>
        </p>
      )}
      {est.amount != null && (
        <div className="d-stay" role="radiogroup" aria-label="How long you'll stay">
          {STAY_OPTIONS.map((m) => (
            <button key={m} role="radio" aria-checked={stayMin === m} className={stayMin === m ? 'on' : ''} onClick={() => onStay(m)}>
              {stayLabel(m)}
            </button>
          ))}
        </div>
      )}
      {est.amount != null && (capped.length > 0 || est.note) && (
        <ul className="d-est-notes">
          {capped.map((c) => (
            <li key={c}>
              <Icon name="check" size={14} /> {/night/.test(c) ? 'Includes the $5 overnight maximum' : `Includes the ${c.match(/\$\d+/)?.[0] ?? ''} daily maximum`}
            </li>
          ))}
          {est.note && (
            <li className="warn">
              <Icon name="info" size={14} /> {est.note}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

export function RatesCard({ sheet, isMotorcycle }: { sheet: RateSheet; isMotorcycle: boolean }) {
  if (sheet.empty && !sheet.rows.length && !sheet.table) return null;
  return (
    <section className="d-card" aria-labelledby="d-rates-h">
      <header className="d-card-head">
        <h2 id="d-rates-h">{isMotorcycle ? 'Motorcycle rates' : 'Rates'}</h2>
      </header>
      {sheet.rows.length > 0 && (
        <dl className="d-rates">
          {sheet.rows.map((r) => (
            <div key={r.when} className={`t-${r.tone}`}>
              <dt>
                <RateIcon when={r.when} tone={r.tone} />
                <span>
                  {r.when}
                  {r.hours && <small>{r.hours}</small>}
                </span>
              </dt>
              <dd>{r.price}</dd>
            </div>
          ))}
        </dl>
      )}
      {sheet.table && (
        <table className="d-table">
          <thead>
            <tr>
              <th scope="col">{sheet.table.unit || 'Time'}</th>
              <th scope="col">Mon–Fri</th>
              <th scope="col">Sat</th>
              <th scope="col">Sun & PH</th>
            </tr>
          </thead>
          <tbody>
            {sheet.table.rows.map((r) => (
              <tr key={r.when}>
                <th scope="row">{r.when}</th>
                {[r.weekday, r.saturday, r.sundayPH].map((v, i) => (
                  <td key={i} className={v === 'Free' ? 'free' : ''}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {sheet.caps.length > 0 && (
        <>
          <h3 className="d-sub-h">Most you'll pay</h3>
          <dl className="d-rates caps">
            {sheet.caps.map((r) => (
              <div key={r.when} className="t-cap">
                <dt>
                  <RateIcon when={r.when} tone="cap" />
                  <span>
                    {r.when}
                    {r.hours && <small>{r.hours}</small>}
                  </span>
                </dt>
                <dd>{r.price}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {sheet.tags.length > 0 && (
        <ul className="d-tags in-card">
          {sheet.tags.map((t) => (
            <li key={t.text} className={`tg ${t.tone}`}>
              <Icon name={t.tone === 'good' ? 'check' : t.tone === 'warn' ? 'alert' : 'info'} size={14} />
              {t.text}
            </li>
          ))}
        </ul>
      )}
      <p className="d-src">Source: {sheet.source}. Estimates only: the signs at the carpark always win.</p>
    </section>
  );
}

function RateIcon({ when, tone }: { when: string; tone: string }) {
  const name: IconName = /night|overnight/i.test(when) ? 'moon' : /sunday/i.test(when) || tone === 'free' ? 'sun' : /peak|mon–sat/i.test(when) ? 'alert' : tone === 'cap' ? 'sun' : 'clock';
  return (
    <span className="rate-ic" aria-hidden="true">
      <Icon name={name} size={16} />
    </span>
  );
}

/* ---------------- Facts ---------------- */

const TYPE: Record<string, string> = {
  'multi-storey': 'Multi-storey',
  surface: 'Open-air surface',
  basement: 'Basement',
  covered: 'Covered',
  mechanised: 'Mechanised',
  'surface-multi': 'Surface and multi-storey',
};
const VISITOR: Record<string, string> = { 'whole-day': '24 hours', '7am-10.30pm': '7am–10:30pm only', '7am-7pm': '7am–7pm only', no: 'None (season parking only)' };

export function carparkType(cp: CarparkInfo): string | null {
  return cp.type ? (TYPE[cp.type] ?? null) : cp.agency === 'LTA' ? 'Mall or building' : null;
}

export function facts(cp: CarparkInfo): Array<{ icon: IconName; label: string; value: string; tone: Tone }> {
  const out: Array<{ icon: IconName; label: string; value: string; tone: Tone }> = [];
  const type = carparkType(cp);
  if (type) out.push({ icon: 'park', label: 'Type', value: type, tone: 'info' });
  if (cp.decks) out.push({ icon: 'layers', label: 'Levels', value: String(cp.decks), tone: 'info' });
  if (cp.heightM) out.push({ icon: 'height', label: 'Height limit', value: `${cp.heightM} m`, tone: cp.heightM < 2.1 ? 'bad' : 'warn' });
  if (cp.type) out.push(isCovered(cp) ? { icon: 'umbrella', label: 'Shelter', value: 'Covered', tone: 'good' } : { icon: 'sun', label: 'Shelter', value: 'Open-air', tone: 'muted' });
  if (cp.system) out.push({ icon: 'ticket', label: 'Payment', value: cp.system === 'electronic' ? 'Electronic' : 'Paper coupons', tone: 'info' });
  if (cp.shortTerm) out.push({ icon: 'clock', label: 'Visitor parking', value: VISITOR[cp.shortTerm] ?? cp.shortTerm, tone: cp.shortTerm === 'whole-day' ? 'good' : cp.shortTerm === 'no' ? 'bad' : 'warn' });
  if (cp.agency === 'LTA') {
    if (cp.area) out.push({ icon: 'map', label: 'Area', value: cp.area, tone: 'info' });
  } else out.push({ icon: 'user', label: 'Run by', value: cp.agency, tone: 'info' });
  out.push({ icon: 'info', label: 'Carpark code', value: cp.code, tone: 'muted' });
  return out;
}

export function FactsGrid({ items }: { items: ReturnType<typeof facts> }) {
  return (
    <dl className="d-facts">
      {items.map((f) => (
        <div key={f.label} className={`fact t-${f.tone}`}>
          <span className="fact-ic" aria-hidden="true">
            <Icon name={f.icon} size={18} />
          </span>
          <span>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </span>
        </div>
      ))}
    </dl>
  );
}
