import { useEffect, useRef, useState } from 'react';
import type { EvSite } from '../../../shared/contract';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { Chip, Empty, Fresh, LotsBlock, lotsPhrase } from '../components/ui';
import { AVAILABILITY_STALE_MS } from '../lib/domain/availability';
import { money, plural, STAY_OPTIONS, stayLabel } from '../lib/domain/format';
import { activeParkFilterCount, chargersNear, type CarparkRow } from '../lib/domain/lists';
import type { Vehicle } from '../lib/domain/rates';
import type { Prefs, SortBy } from '../lib/storage/store';
import { ParkFiltersSheet } from './FiltersSheet';

const SORTS: Array<{ id: SortBy; label: string; hint: string }> = [
  { id: 'nearest', label: 'Nearest', hint: 'Shortest walk to your place' },
  { id: 'space', label: 'Most space', hint: 'Most free lots first' },
  { id: 'cheapest', label: 'Cheapest', hint: 'Lowest estimated cost for your stay' },
];

const TYPE_WORD: Record<string, string> = {
  'multi-storey': 'Multi-storey',
  surface: 'Surface',
  basement: 'Basement',
  covered: 'Covered',
  mechanised: 'Mechanised',
  'surface-multi': 'Surface + multi-storey',
};

export const vehicleWord = (v: Vehicle) => (v === 'motorcycle' ? 'motorcycle' : 'car');

export function ParkingHeader({
  count,
  placeLabel,
  updatedAt,
  error,
  now,
  onRetry,
  prefs,
  setPrefs,
  hasPlace,
}: {
  count: number;
  placeLabel: string;
  /** When the server last got the counts from LTA (not when this phone received them). */
  updatedAt: number | null;
  error: Error | null;
  now: number;
  onRetry: () => void;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  hasPlace: boolean;
}) {
  const [picker, setPicker] = useState<'sort' | 'stay' | 'filters' | null>(null);
  const f = prefs.parkFilters;
  const n = activeParkFilterCount(f);
  return (
    <div className="ph">
      <div className="ph-title">
        <h2>{hasPlace ? `${plural(count, 'carpark')} near ${placeLabel}` : 'Carparks'}</h2>
        <Fresh at={updatedAt} now={now} staleAfterMs={5 * 60_000} error={error} onRetry={onRetry} />
      </div>
      <div className="ctrls" role="toolbar" aria-label="Sort and filter">
        <Chip icon="sort" onClick={() => setPicker('sort')} label={`Sort: ${SORTS.find((s) => s.id === prefs.sort)?.label}`}>
          {SORTS.find((s) => s.id === prefs.sort)?.label}
          <Icon name="down" size={14} />
        </Chip>
        <Chip icon="clock" on onClick={() => setPicker('stay')} label={`Stay ${stayLabel(prefs.stayMin)}`}>
          Stay {stayLabel(prefs.stayMin)}
          <Icon name="down" size={14} />
        </Chip>
        <Chip icon="sliders" on={n > 0} badge={n} onClick={() => setPicker('filters')}>
          Filters
        </Chip>
        <Chip icon="roof" on={f.covered} onClick={() => setPrefs({ parkFilters: { ...f, covered: !f.covered } })}>
          Covered
        </Chip>
        <Chip icon="check" on={f.hasSpace} onClick={() => setPrefs({ parkFilters: { ...f, hasSpace: !f.hasSpace } })}>
          Has space
        </Chip>
      </div>
      <Sheet open={picker === 'sort'} onClose={() => setPicker(null)} title="Sort carparks">
        <h3 className="sheet-h">Sort carparks</h3>
        <div className="opts">
          {SORTS.map((s) => (
            <button
              key={s.id}
              className={`opt${prefs.sort === s.id ? ' on' : ''}`}
              onClick={() => {
                setPrefs({ sort: s.id });
                setPicker(null);
              }}
            >
              <span>
                <b>{s.label}</b>
                <small>{s.hint}</small>
              </span>
              {prefs.sort === s.id && <Icon name="check" />}
            </button>
          ))}
        </div>
      </Sheet>
      <Sheet open={picker === 'stay'} onClose={() => setPicker(null)} title="How long will you stay?">
        <h3 className="sheet-h">How long will you stay?</h3>
        <p className="sheet-sub">Used for the estimated cost, from now.</p>
        <div className="stay-grid">
          {STAY_OPTIONS.map((m) => (
            <button
              key={m}
              className={`stay${prefs.stayMin === m ? ' on' : ''}`}
              onClick={() => {
                setPrefs({ stayMin: m });
                setPicker(null);
              }}
            >
              {stayLabel(m)}
            </button>
          ))}
        </div>
      </Sheet>
      <ParkFiltersSheet open={picker === 'filters'} onClose={() => setPicker(null)} prefs={prefs} setPrefs={setPrefs} />
    </div>
  );
}

export function ParkingList({
  rows,
  walkMin,
  hidden,
  vehicle,
  stayMin,
  evSites,
  selectedId,
  onOpen,
  hasPlace,
  onSearch,
  onLocate,
  onClearFilters,
  availabilityAt,
  now,
}: {
  rows: CarparkRow[];
  walkMin: number;
  hidden: number;
  vehicle: Vehicle;
  stayMin: number;
  evSites: EvSite[] | null;
  selectedId: string | null;
  onOpen: (id: string) => void;
  hasPlace: boolean;
  onSearch: () => void;
  onLocate: () => void;
  onClearFilters: () => void;
  availabilityAt: number | null;
  now: number;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!selectedId) return;
    listRef.current?.querySelector(`[data-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  if (!hasPlace) {
    return (
      <Empty icon="search" title="Where are you going?">
        <p>Search a place, postal code or carpark, or use your location to see carparks nearby.</p>
        <div className="empty-actions">
          <button className="btn primary" onClick={onSearch}>
            <Icon name="search" size={18} /> Search
          </button>
          <button className="btn" onClick={onLocate}>
            <Icon name="locate" size={18} /> Use my location
          </button>
        </div>
      </Empty>
    );
  }
  if (!rows.length) {
    return (
      <Empty icon="park" title={`No carparks within ${walkMin} min walk`}>
        <p>{hidden ? `${plural(hidden, 'carpark')} hidden by your filters.` : 'Try another place.'}</p>
        {hidden > 0 && (
          <div className="empty-actions">
            <button className="btn" onClick={onClearFilters}>
              Clear filters
            </button>
          </div>
        )}
      </Empty>
    );
  }
  const stale = !availabilityAt || now - availabilityAt > AVAILABILITY_STALE_MS;
  const vw = vehicleWord(vehicle);
  return (
    <>
      {walkMin > 10 && <p className="list-note">Nothing within 10 min walk, so showing up to {walkMin} min.</p>}
      {stale && availabilityAt && <p className="list-note warn">Live lots are more than 15 minutes old, so they're hidden until the next update.</p>}
      <ul className="rows" ref={listRef}>
        {rows.map((r) => {
          const evCount = evSites ? chargersNear(r.cp, evSites).reduce((n, s) => n + s.connectors.length, 0) : 0;
          const facts: Array<{ t: string; cls?: string; icon?: 'boltf' | 'height' | 'roof' }> = [];
          if (r.cp.shortTerm === 'no') facts.push({ t: 'Season only', cls: 'warn' });
          if (r.freeNow) facts.push({ t: 'Free now', cls: 'good' });
          if (evCount) facts.push({ t: plural(evCount, 'charger'), cls: 'ev', icon: 'boltf' });
          if (r.cp.heightM && r.cp.heightM < 2.1) facts.push({ t: `${r.cp.heightM} m`, cls: 'warn', icon: 'height' });
          if (r.covered) facts.push({ t: 'Covered', icon: 'roof' });
          if (r.cp.freeParking && !r.freeNow) facts.push({ t: 'Free Sun/PH' });
          if (r.cp.night) facts.push({ t: 'Night cap' });
          const type = r.cp.type ? TYPE_WORD[r.cp.type] : r.cp.agency === 'LTA' ? (r.cp.area ? `Mall · ${r.cp.area}` : 'Mall') : 'Carpark';
          const cost = r.cost.amount;
          return (
            <li key={r.cp.id} data-id={r.cp.id}>
              <button
                className={`row lv-${r.lots.level}${selectedId === r.cp.id ? ' sel' : ''}`}
                onClick={() => onOpen(r.cp.id)}
                aria-label={`${r.cp.name}. ${lotsPhrase(r.lots, vw)}. ${r.walk} minute walk. ${cost == null ? 'No published rate' : `Estimated ${money(cost)} for ${stayLabel(stayMin)}`}.`}
              >
                <LotsBlock lots={r.lots} />
                <span className="rt">
                  <b>{r.cp.name}</b>
                  <span className="meta">
                    {r.cp.agency === 'LTA' ? '' : `${r.cp.agency} · `}
                    {type} · <Icon name="walk" size={14} /> {r.walk} min
                  </span>
                  {facts.length > 0 && (
                    <span className="facts">
                      {facts.slice(0, 3).map((x) => (
                        <em key={x.t} className={x.cls}>
                          {x.icon && <Icon name={x.icon} size={12} />}
                          {x.t}
                        </em>
                      ))}
                    </span>
                  )}
                </span>
                <span className="cost">
                  <b>{cost == null ? '—' : money(cost)}</b>
                  <small>{cost == null ? (r.cp.agency === 'LTA' ? 'mall rate' : 'no rate') : r.cost.kind === 'typical' ? `std. rate · ${stayLabel(stayMin)}` : `est. ${stayLabel(stayMin)}`}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {stale && !availabilityAt && <p className="list-note">Loading live lots…</p>}
      <p className="list-foot">Lots: LTA DataMall, HDB via data.gov.sg. Costs are estimates from HDB / URA published rates.</p>
    </>
  );
}
