import type { CarparkInfo, EvConnector, EvSite } from '../../../shared/contract';
import { Icon } from '../components/Icon';
import { Fresh, ScreenHeader } from '../components/ui';
import { evSummary } from '../lib/domain/availability';
import { evPrice, kw, plural } from '../lib/domain/format';
import { distanceM, formatDistance, walkMinutes, type LatLng } from '../lib/domain/geo';
import type { Prefs } from '../lib/storage/store';

const STATUS: Record<EvConnector['status'], string> = { available: 'Available', 'in-use': 'In use', 'out-of-service': 'Out of service' };

export function ChargerDetail({
  site,
  prefs,
  place,
  here,
  carpark,
  receivedAt,
  now,
  saved,
  onToggleSave,
  onBack,
  onNavigate,
  onOpenCarpark,
  onRetry,
}: {
  site: EvSite;
  prefs: Prefs;
  place: { label: string; at: LatLng } | null;
  here: LatLng | null;
  carpark: CarparkInfo | null;
  receivedAt: number | null;
  now: number;
  saved: boolean;
  onToggleSave: () => void;
  onBack: () => void;
  onNavigate: () => void;
  onOpenCarpark: (id: string) => void;
  onRetry: () => void;
}) {
  const sum = evSummary(site, prefs.plugs);
  const all = evSummary(site, 'all');
  const fits = (c: EvConnector) => c.plug !== 'other' && prefs.plugs.includes(c.plug);
  const sorted = [...site.connectors].sort((a, b) => Number(fits(b)) - Number(fits(a)) || a.position.localeCompare(b.position));
  return (
    <div className="screen detail">
      <ScreenHeader
        title=""
        onBack={onBack}
        actions={
          <button className={`ib${saved ? ' on' : ''}`} onClick={onToggleSave} aria-label={saved ? 'Remove from saved' : 'Save charger'} aria-pressed={saved}>
            <Icon name={saved ? 'star' : 'staro'} size={22} />
          </button>
        }
      />
      <div className="scr-body">
        <h1 className="d-title">{site.name}</h1>
        <p className="d-sub">
          {[site.operators.join(', '), place ? `${walkMinutes(distanceM(place.at, site), prefs.walkingPaceMpm)} min walk to ${place.label}` : null, here ? (place ? `${formatDistance(distanceM(here, site))} from you` : `${walkMinutes(distanceM(here, site), prefs.walkingPaceMpm)} min walk from you`) : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <section className={`d-lots lv-${sum.level}`} aria-label={`${sum.free} of ${sum.total} connectors that fit your car are free`}>
          <span className={`lots lv-${sum.level}`} aria-hidden="true">
            <b>
              {sum.free}/{sum.total}
            </b>
            <small>free</small>
          </span>
          <span className="d-lots-tx">
            <b>Connectors that fit your plugs</b>
            <small>
              {plural(all.total, 'connector')} here in total · {evPrice(sum.price)}
            </small>
            <Fresh at={receivedAt} now={now} staleAfterMs={15 * 60_000} onRetry={onRetry} />
          </span>
        </section>
        <div className="d-actions">
          <button className="btn primary" onClick={onNavigate}>
            <Icon name="navf" size={18} /> Navigate
          </button>
        </div>

        <section className="d-sec">
          <h2>Connectors</h2>
          <ul className="conn">
            {sorted.map((c) => (
              <li key={c.id} className={`st-${c.status}${fits(c) ? '' : ' nofit'}`}>
                <span className="conn-st">
                  <i />
                  {STATUS[c.status]}
                </span>
                <span className="conn-main">
                  <b>
                    {c.plugLabel} · {c.current} {kw(c.kw)}
                  </b>
                  <small>
                    {[c.position, c.operator, c.price != null ? (c.priceUnit === 'free' ? 'Free' : `$${c.price.toFixed(2)}/${c.priceUnit}`) : 'Price not published'].filter(Boolean).join(' · ')}
                    {!fits(c) && ' · doesn’t fit your plugs'}
                  </small>
                </span>
              </li>
            ))}
          </ul>
          <p className="d-src">LTA DataMall EV charging points: status refreshed every 5 minutes. Prices include GST. Address: {site.address}</p>
        </section>

        {carpark && (
          <section className="d-sec">
            <h2>Parking here</h2>
            <button className="d-ev" onClick={() => onOpenCarpark(carpark.id)}>
              <Icon name="park" />
              <span>
                <b>{carpark.name}</b>
                <small>Parking charges apply as well as charging</small>
              </span>
              <Icon name="right" />
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
