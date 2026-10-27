import type { Agency, PlugKind } from '../../../shared/contract';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { Toggle } from '../components/ui';
import { PLUG_LABEL } from '../lib/domain/availability';
import { DEFAULT_EV_FILTERS, DEFAULT_PARK_FILTERS, type Prefs } from '../lib/storage/store';

function Row({ title, sub, on, onChange }: { title: string; sub?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="set-row">
      <span>
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </span>
      <Toggle on={on} onChange={onChange} label={title} />
    </div>
  );
}

function Pills<T extends string | number>({ value, options, onChange, multi }: { value: T[]; options: Array<{ id: T; label: string }>; onChange: (v: T[]) => void; multi?: boolean }) {
  return (
    <div className="pills">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button key={String(o.id)} className={`pill${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onChange(multi ? (on ? value.filter((v) => v !== o.id) : [...value, o.id]) : [o.id])}>
            {on && <Icon name="check" size={14} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ParkFiltersSheet({ open, onClose, prefs, setPrefs }: { open: boolean; onClose: () => void; prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void }) {
  const f = prefs.parkFilters;
  const set = (p: Partial<typeof f>) => setPrefs({ parkFilters: { ...f, ...p } });
  const agencies: Array<{ id: Agency; label: string }> = [
    { id: 'HDB', label: 'HDB' },
    { id: 'URA', label: 'URA' },
    { id: 'LTA', label: 'Malls' },
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Carpark filters">
      <div className="sheet-top">
        <h3 className="sheet-h">Carpark filters</h3>
        <button className="link" onClick={() => setPrefs({ parkFilters: DEFAULT_PARK_FILTERS })}>
          Reset
        </button>
      </div>
      <div className="set-card">
        <Row title="Has space now" sub="Hide full carparks and ones without live data" on={f.hasSpace} onChange={(v) => set({ hasSpace: v })} />
        <Row title="Covered" sub="Multi-storey, basement or covered" on={f.covered} onChange={(v) => set({ covered: v })} />
        <Row title="Free right now" sub="e.g. HDB free parking on Sundays & public holidays" on={f.freeNow} onChange={(v) => set({ freeNow: v })} />
        <Row title="Night parking cap" sub="$5 per night, 10:30pm–7am" on={f.night} onChange={(v) => set({ night: v })} />
        <Row title="Electronic parking" sub="No coupons needed" on={f.electronic} onChange={(v) => set({ electronic: v })} />
        <Row title="Show season-only carparks" sub="HDB carparks without short-term parking" on={!f.hideSeasonOnly} onChange={(v) => set({ hideSeasonOnly: !v })} />
      </div>
      <h4 className="set-h">My vehicle needs a gantry height of at least</h4>
      <Pills
        value={[f.minHeightM]}
        onChange={([v]) => set({ minHeightM: v ?? 0 })}
        options={[
          { id: 0, label: 'Any' },
          { id: 1.9, label: '1.9 m' },
          { id: 2, label: '2.0 m' },
          { id: 2.1, label: '2.1 m' },
          { id: 2.15, label: '2.15 m' },
        ]}
      />
      <h4 className="set-h">Run by</h4>
      <Pills multi value={f.agencies} onChange={(v) => set({ agencies: v })} options={agencies} />
      <button className="btn primary block" onClick={onClose}>
        Done
      </button>
    </Sheet>
  );
}

export function EvFiltersSheet({ open, onClose, prefs, setPrefs, operators }: { open: boolean; onClose: () => void; prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void; operators: string[] }) {
  const f = prefs.evFilters;
  const set = (p: Partial<typeof f>) => setPrefs({ evFilters: { ...f, ...p } });
  const plugs: Array<{ id: PlugKind; label: string }> = (['type2', 'ccs2', 'chademo'] as const).map((id) => ({ id, label: PLUG_LABEL[id] }));
  return (
    <Sheet open={open} onClose={onClose} title="Charger filters">
      <div className="sheet-top">
        <h3 className="sheet-h">Charger filters</h3>
        <button className="link" onClick={() => setPrefs({ evFilters: DEFAULT_EV_FILTERS })}>
          Reset
        </button>
      </div>
      <h4 className="set-h">My plugs</h4>
      <Pills multi value={prefs.plugs} onChange={(v) => v.length && setPrefs({ plugs: v })} options={plugs} />
      <div className="set-card">
        <Row title="Available now" sub="At least one free connector that fits" on={f.availableNow} onChange={(v) => set({ availableNow: v })} />
        <Row title="DC fast charging only" on={f.dcOnly} onChange={(v) => set({ dcOnly: v })} />
      </div>
      <h4 className="set-h">Minimum power</h4>
      <Pills
        value={[f.minKw]}
        onChange={([v]) => set({ minKw: v ?? 0 })}
        options={[
          { id: 0, label: 'Any' },
          { id: 7, label: '7 kW+' },
          { id: 22, label: '22 kW+' },
          { id: 50, label: '50 kW+' },
          { id: 100, label: '100 kW+' },
        ]}
      />
      {operators.length > 0 && (
        <>
          <h4 className="set-h">Operator</h4>
          <Pills multi value={f.operators} onChange={(v) => set({ operators: v })} options={operators.map((o) => ({ id: o, label: o }))} />
        </>
      )}
      <button className="btn primary block" onClick={onClose}>
        Done
      </button>
    </Sheet>
  );
}
