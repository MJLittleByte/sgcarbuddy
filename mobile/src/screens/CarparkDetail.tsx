import type { AvailabilityResponse, CarparkInfo, EvSite } from '../../../shared/contract';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ui';
import { evSummary, lotsFor } from '../lib/domain/availability';
import { evPrice, kw, money, plural } from '../lib/domain/format';
import { distanceM, formatDistance, walkMinutes, type LatLng } from '../lib/domain/geo';
import { chargersNear } from '../lib/domain/lists';
import { estimateCost, rateAt, rateSheet } from '../lib/domain/rates';
import type { Prefs } from '../lib/storage/store';
import { mailto } from '../app/links';
import { carparkType, facts, FactsGrid, highlights, LotsHero, PriceCard, RatesCard } from './CarparkDetailParts';
import { vehicleWord } from './ParkingPanel';

export function CarparkDetail({
  cp,
  prefs,
  avail,
  availError,
  evSites,
  place,
  here,
  now,
  saved,
  onToggleSave,
  onBack,
  onNavigate,
  onParkHere,
  onShare,
  onOpenCharger,
  onRetry,
  onStay,
}: {
  cp: CarparkInfo;
  prefs: Prefs;
  avail: AvailabilityResponse | null;
  availError: Error | null;
  evSites: EvSite[] | null;
  place: { label: string; at: LatLng } | null;
  here: LatLng | null;
  now: number;
  saved: boolean;
  onToggleSave: () => void;
  onBack: () => void;
  onNavigate: () => void;
  onParkHere: () => void;
  onShare: () => void;
  onOpenCharger: (id: string) => void;
  onRetry: () => void;
  onStay: (min: number) => void;
}) {
  const v = prefs.vehicle;
  const vw = vehicleWord(v);
  const lots = lotsFor(cp, v, avail, now);
  const other = lotsFor(cp, v === 'motorcycle' ? 'car' : 'motorcycle', avail, now);
  const est = estimateCost(cp, v, now, prefs.stayMin);
  const sheet = rateSheet(cp, v);
  const nowRate = rateAt(cp, v, now);
  const chargers = evSites ? chargersNear(cp, evSites) : [];
  const type = carparkType(cp);
  const tags = highlights(cp, v, chargers.length);
  const sub = [
    cp.agency === 'LTA' ? null : cp.agency,
    type,
    cp.agency === 'LTA' ? cp.area : null,
    place ? `${walkMinutes(distanceM(place.at, cp), prefs.walkingPaceMpm)} min walk to ${place.label}` : null,
    here ? (place ? `${formatDistance(distanceM(here, cp))} from you` : `${walkMinutes(distanceM(here, cp), prefs.walkingPaceMpm)} min walk from you`) : null,
  ].filter(Boolean);

  return (
    <div className="screen detail">
      <ScreenHeader
        title=""
        onBack={onBack}
        actions={
          <>
            <button className={`ib${saved ? ' on' : ''}`} onClick={onToggleSave} aria-label={saved ? 'Remove from saved' : 'Save carpark'} aria-pressed={saved}>
              <Icon name={saved ? 'star' : 'staro'} size={22} />
            </button>
            <button className="ib" onClick={onShare} aria-label="Share">
              <Icon name="share" size={22} />
            </button>
          </>
        }
      />
      <div className="scr-body">
        <h1 className="d-title">{cp.name}</h1>
        <p className="d-sub">{sub.join(' · ')}</p>
        {tags.length > 0 && (
          <ul className="d-tags" aria-label="Highlights">
            {tags.map((t) => (
              <li key={t.text} className={`tg ${t.tone}`}>
                <Icon name={t.icon} size={14} />
                {t.text}
              </li>
            ))}
          </ul>
        )}

        <LotsHero lots={lots} other={other} vw={vw} fetchedAt={avail ? Date.parse(avail.fetchedAt) : null} now={now} error={availError} onRetry={onRetry} />

        <div className="d-actions">
          <button className="btn primary" onClick={onNavigate}>
            <Icon name="navf" size={18} /> Navigate
          </button>
          <button className="btn tonal" onClick={onParkHere}>
            <Icon name={v === 'motorcycle' ? 'moto' : 'car'} size={19} /> I've parked here
          </button>
        </div>

        <PriceCard
          est={est}
          nowLabel={nowRate ? (nowRate.free ? { text: 'Free now', free: true } : { text: `Now ${money(nowRate.half)} / 30 min`, free: false }) : null}
          stayMin={prefs.stayMin}
          onStay={onStay}
          emptyNote={sheet.empty}
        />
        <RatesCard sheet={sheet} isMotorcycle={v === 'motorcycle'} />
        {v === 'ev' && est.amount != null && <p className="d-note">EV charging is billed separately by the charger operator.</p>}

        {chargers.length > 0 && (
          <section className="d-card" aria-labelledby="d-ev-h">
            <header className="d-card-head">
              <h2 id="d-ev-h">EV chargers here</h2>
            </header>
            {chargers.map((s) => {
              const sum = evSummary(s, prefs.vehicle === 'ev' ? prefs.plugs : 'all');
              return (
                <button key={s.id} className="d-ev" onClick={() => onOpenCharger(s.id)}>
                  <span className="d-ev-ic" aria-hidden="true">
                    <Icon name="boltf" size={20} />
                  </span>
                  <span className="d-ev-tx">
                    <b>{s.operators.join(', ')}</b>
                    <small>
                      {[plural(sum.total, 'connector'), sum.plugs.join(', '), sum.maxKw ? `up to ${kw(sum.maxKw)}` : null, evPrice(sum.price)].filter(Boolean).join(' · ')}
                    </small>
                  </span>
                  <span className={`d-ev-free${sum.free > 0 ? ' ok' : ''}`}>{sum.total === 0 ? 'No fit' : sum.free > 0 ? `${sum.free} free` : sum.inUse > 0 ? 'In use' : 'Offline'}</span>
                  <Icon name="right" />
                </button>
              );
            })}
            <p className="d-src">Chargers within 120 m (LTA EV charging points).</p>
          </section>
        )}

        <section className="d-card" aria-labelledby="d-about-h">
          <header className="d-card-head">
            <h2 id="d-about-h">About this carpark</h2>
          </header>
          <FactsGrid items={facts(cp)} />
          {cp.heightM != null && cp.heightM < 2.1 && (
            <p className="d-warn">
              <Icon name="height" size={16} /> Low gantry: {cp.heightM} m. Check before entering with a tall vehicle or roof box.
            </p>
          )}
        </section>

        <a className="d-report" href={mailto(`SG Car Buddy: problem with carpark ${cp.code} (${cp.name})`)}>
          <Icon name="flag" size={18} /> Report a problem with this carpark
        </a>
      </div>
    </div>
  );
}
