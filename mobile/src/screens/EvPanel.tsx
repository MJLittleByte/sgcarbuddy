import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Chip, Empty, Fresh } from '../components/ui';
import { PLUG_LABEL } from '../lib/domain/availability';
import { evPrice, kw, plural } from '../lib/domain/format';
import { activeEvFilterCount, type EvRow } from '../lib/domain/lists';
import type { Prefs } from '../lib/storage/store';
import { EvFiltersSheet } from './FiltersSheet';

export function EvHeader({
  count,
  placeLabel,
  receivedAt,
  error,
  now,
  onRetry,
  prefs,
  setPrefs,
  operators,
  hasPlace,
}: {
  count: number;
  placeLabel: string;
  receivedAt: number | null;
  error: Error | null;
  now: number;
  onRetry: () => void;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  operators: string[];
  hasPlace: boolean;
}) {
  const [filters, setFilters] = useState(false);
  const f = prefs.evFilters;
  return (
    <div className="ph">
      <div className="ph-title">
        <h2>{hasPlace ? `${plural(count, 'charging site')} near ${placeLabel}` : 'EV chargers'}</h2>
        <Fresh at={receivedAt} now={now} staleAfterMs={15 * 60_000} error={error} onRetry={onRetry} />
      </div>
      <div className="ctrls" role="toolbar" aria-label="Charger filters">
        <Chip icon="plug" on onClick={() => setFilters(true)} label="My plugs">
          {prefs.plugs.map((p) => PLUG_LABEL[p]).join(' · ')}
        </Chip>
        <Chip icon="check" on={f.availableNow} onClick={() => setPrefs({ evFilters: { ...f, availableNow: !f.availableNow } })}>
          Available now
        </Chip>
        <Chip icon="bolt" on={f.dcOnly} onClick={() => setPrefs({ evFilters: { ...f, dcOnly: !f.dcOnly } })}>
          DC fast
        </Chip>
        <Chip icon="sliders" on={activeEvFilterCount(f) > 0} badge={activeEvFilterCount(f)} onClick={() => setFilters(true)} label="All charger filters" />
      </div>
      <EvFiltersSheet open={filters} onClose={() => setFilters(false)} prefs={prefs} setPrefs={setPrefs} operators={operators} />
    </div>
  );
}

export function EvList({ rows, walkMin, selectedId, onOpen, hasPlace, loading, error, onRetry, onSearch }: { rows: EvRow[]; walkMin: number; selectedId: string | null; onOpen: (id: string) => void; hasPlace: boolean; loading: boolean; error: string | null; onRetry: () => void; onSearch: () => void }) {
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (selectedId) listRef.current?.querySelector(`[data-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);
  if (!hasPlace) {
    return (
      <Empty icon="bolt" title="Find chargers near a place">
        <p>Search a place or use your location.</p>
        <div className="empty-actions">
          <button className="btn primary" onClick={onSearch}>
            <Icon name="search" size={18} /> Search
          </button>
        </div>
      </Empty>
    );
  }
  if (!rows.length) {
    if (loading && error) {
      return (
        <Empty icon="plug" title="EV charger data unavailable">
          <p>{error}</p>
          <div className="empty-actions">
            <button className="btn" onClick={onRetry}>
              <Icon name="refresh" size={18} /> Retry
            </button>
          </div>
        </Empty>
      );
    }
    return (
      <Empty icon="plug" title={loading ? 'Loading chargers…' : `No matching chargers within ${walkMin} min walk`}>
        {!loading && <p>Check your plug types and filters.</p>}
      </Empty>
    );
  }
  return (
    <>
      {walkMin > 15 && <p className="list-note">Nothing close by, so showing up to {walkMin} min walk.</p>}
      <ul className="rows" ref={listRef}>
        {rows.map(({ site, sum, walk }) => (
          <li key={site.id} data-id={site.id}>
            <button
              className={`row lv-${sum.level}${selectedId === site.id ? ' sel' : ''}`}
              onClick={() => onOpen(site.id)}
              aria-label={`${site.name}. ${sum.free} of ${sum.total} connectors free. ${walk} minute walk. ${evPrice(sum.price)}.`}
            >
              <span className={`lots lv-${sum.level}`} aria-hidden="true">
                <b>
                  {sum.free}/{sum.total}
                </b>
                <small>{sum.free ? 'free' : sum.inUse ? 'in use' : 'offline'}</small>
                <span className="bar">
                  <i style={{ width: `${Math.max(4, (sum.free / Math.max(1, sum.total)) * 100)}%` }} />
                </span>
              </span>
              <span className="rt">
                <b>{site.name}</b>
                <span className="meta">
                  {site.operators.join(', ')} · <Icon name="walk" size={14} /> {walk} min
                </span>
                <span className="facts">
                  <em>
                    <Icon name="plug" size={12} />
                    {sum.plugs.join(', ')}
                  </em>
                  {sum.maxKw != null && <em className={sum.dc ? 'ev' : ''}>{`${kw(sum.maxKw)} ${sum.dc ? 'DC' : 'AC'}`}</em>}
                  {sum.outOfService > 0 && <em className="warn">{sum.outOfService} offline</em>}
                </span>
              </span>
              <span className="cost">
                <b>{sum.price ? (sum.price.unit === 'free' ? 'Free' : `$${sum.price.amount.toFixed(2)}`) : '—'}</b>
                <small>{sum.price ? (sum.price.unit === 'free' ? '' : `per ${sum.price.unit}`) : 'no price'}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="list-foot">Live connector status: LTA DataMall EV charging points (every 5 min). Prices include GST.</p>
    </>
  );
}
