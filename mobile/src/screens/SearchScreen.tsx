import { useEffect, useMemo, useRef, useState } from 'react';
import type { CarparkInfo, Place as ApiPlace } from '../../../shared/contract';
import { Icon } from '../components/Icon';
import { api } from '../lib/api/client';
import type { Lots } from '../lib/domain/availability';
import { indexCarparks, isPostalCode, searchCarparks } from '../lib/domain/search';
import type { Recent, SavedItem, SavedPlace } from '../lib/storage/store';

export interface SearchPick {
  label: string;
  sub?: string;
  lat: number;
  lng: number;
  kind: 'search' | 'saved' | 'carpark';
  carparkId?: string;
}

function usePlaces(q: string, enabled: boolean) {
  const [state, setState] = useState<{ q: string; results: ApiPlace[]; loading: boolean; error: boolean }>({ q: '', results: [], loading: false, error: false });
  useEffect(() => {
    if (!enabled) {
      setState({ q, results: [], loading: false, error: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    const t = window.setTimeout(() => {
      api
        .places(q)
        .then((r) => setState({ q, results: r.results, loading: false, error: false }))
        .catch(() => setState({ q, results: [], loading: false, error: true }));
    }, 300);
    return () => window.clearTimeout(t);
  }, [q, enabled]);
  return state;
}

export function SearchScreen({
  carparks,
  places,
  items,
  recents,
  lotsOf,
  canUseLocation,
  onBack,
  onPick,
  onNearMe,
  onSetSaved,
  onClearRecents,
  onOpenItem,
  banner,
}: {
  carparks: readonly CarparkInfo[];
  places: SavedPlace[];
  items: SavedItem[];
  recents: Recent[];
  lotsOf: (cp: CarparkInfo) => Lots;
  canUseLocation: boolean;
  onBack: () => void;
  onPick: (p: SearchPick) => void;
  onNearMe: () => void;
  onSetSaved: (icon: 'home' | 'work') => void;
  onClearRecents: () => void;
  onOpenItem: (item: SavedItem) => void;
  /** Shown above the results, e.g. "Choose your Home address". */
  banner?: string;
}) {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, []);
  const index = useMemo(() => indexCarparks(carparks), [carparks]);
  const query = q.trim();
  const cpHits = useMemo(() => (query.length >= 2 ? searchCarparks(index, query, 5) : []), [index, query]);
  const remote = usePlaces(query, query.length >= 3 || isPostalCode(query));
  const home = places.find((p) => p.icon === 'home');
  const work = places.find((p) => p.icon === 'work');
  const others = places.filter((p) => p.icon === 'star');

  return (
    <div className="screen search">
      <header className="s-head">
        <button className="ib" onClick={onBack} aria-label="Back">
          <Icon name="left" size={22} />
        </button>
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          placeholder="Place, postal code or carpark"
          aria-label="Search a place, postal code or carpark"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const first = remote.results[0];
              if (first) onPick({ label: first.name, sub: first.address, lat: first.latitude, lng: first.longitude, kind: 'search' });
            }
          }}
        />
        {q && (
          <button className="ib" onClick={() => setQ('')} aria-label="Clear">
            <Icon name="x" size={20} />
          </button>
        )}
      </header>
      <div className="scr-body">
        {banner && <p className="s-banner">{banner}</p>}
        {!query && !banner && (
          <>
            <ul className="s-list">
              <li>
                <button className="s-item" onClick={onNearMe}>
                  <span className="s-ic accent">
                    <Icon name="locate" />
                  </span>
                  <span>
                    <b>Near you</b>
                    <small>{canUseLocation ? 'Use your current location' : 'Turn on location'}</small>
                  </span>
                </button>
              </li>
              {(['home', 'work'] as const).map((k) => {
                const p = k === 'home' ? home : work;
                return (
                  <li key={k}>
                    <button className="s-item" onClick={() => (p ? onPick({ label: p.label, sub: p.address, lat: p.lat, lng: p.lng, kind: 'saved' }) : onSetSaved(k))}>
                      <span className="s-ic">
                        <Icon name={k} />
                      </span>
                      <span>
                        <b>{k === 'home' ? 'Home' : 'Work'}</b>
                        <small>{p ? p.address || p.label : `Set your ${k === 'home' ? 'home' : 'work'} address`}</small>
                      </span>
                    </button>
                  </li>
                );
              })}
              {others.map((p) => (
                <li key={p.id}>
                  <button className="s-item" onClick={() => onPick({ label: p.label, sub: p.address, lat: p.lat, lng: p.lng, kind: 'saved' })}>
                    <span className="s-ic">
                      <Icon name="star" />
                    </span>
                    <span>
                      <b>{p.label}</b>
                      {p.address && <small>{p.address}</small>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {items.length > 0 && (
              <>
                <h3 className="s-h">Saved carparks and chargers</h3>
                <ul className="s-list">
                  {items.map((it) => {
                    const cp = it.kind === 'carpark' ? carparks.find((c) => c.id === it.id) : undefined;
                    const lots = cp ? lotsOf(cp) : null;
                    return (
                      <li key={`${it.kind}${it.id}`}>
                        <button className="s-item" onClick={() => onOpenItem(it)}>
                          <span className="s-ic">
                            <Icon name={it.kind === 'carpark' ? 'park' : 'bolt'} />
                          </span>
                          <span>
                            <b>{cp?.name ?? it.name}</b>
                            <small>{it.kind === 'carpark' ? (lots?.free != null ? `${lots.free} lots free now` : 'No live data') : 'EV charger'}</small>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {recents.length > 0 && (
              <>
                <h3 className="s-h">
                  Recent
                  <button className="link" onClick={onClearRecents}>
                    Clear
                  </button>
                </h3>
                <ul className="s-list">
                  {recents.map((r) => (
                    <li key={`${r.label}${r.lat}`}>
                      <button className="s-item" onClick={() => onPick({ ...r, kind: 'search' })}>
                        <span className="s-ic">
                          <Icon name="clock" />
                        </span>
                        <span>
                          <b>{r.label}</b>
                          {r.sub && <small>{r.sub}</small>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="s-tip">Tip: try a mall, a postal code like 238801, a block and street, or a carpark code like CK7.</p>
          </>
        )}

        {query && (
          <>
            {cpHits.length > 0 && (
              <>
                <h3 className="s-h">Carparks</h3>
                <ul className="s-list">
                  {cpHits.map((cp) => {
                    const lots = lotsOf(cp);
                    return (
                      <li key={cp.id}>
                        <button className="s-item" onClick={() => onPick({ label: cp.name, lat: cp.lat, lng: cp.lng, kind: 'carpark', carparkId: cp.id })}>
                          <span className={`s-ic lv-${lots.level}`}>
                            <Icon name="park" />
                          </span>
                          <span>
                            <b>{cp.name}</b>
                            <small>
                              {cp.agency === 'LTA' ? 'Mall' : cp.agency} · {cp.code}
                              {lots.free != null ? ` · ${lots.free} lots free` : ''}
                            </small>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            <h3 className="s-h">Places</h3>
            {remote.loading && !remote.results.length && <p className="list-note">Searching OneMap…</p>}
            {!remote.loading && remote.error && <p className="list-note warn">Place search isn't available right now. Carpark names still work.</p>}
            {!remote.loading && !remote.error && query.length >= 3 && !remote.results.length && <p className="list-note">No places found. Try a postal code, or a block number and street.</p>}
            {query.length < 3 && !isPostalCode(query) && <p className="list-note">Keep typing…</p>}
            <ul className="s-list">
              {remote.results.map((p) => (
                <li key={`${p.name}${p.latitude}`}>
                  <button className="s-item" onClick={() => onPick({ label: p.name, sub: p.address, lat: p.latitude, lng: p.longitude, kind: 'search' })}>
                    <span className="s-ic">
                      <Icon name="pin" />
                    </span>
                    <span>
                      <b>{p.name}</b>
                      <small>
                        {p.address}
                        {p.postal ? ` · ${p.postal}` : ''}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="s-src">Place search by OneMap © Singapore Land Authority</p>
          </>
        )}
      </div>
    </div>
  );
}
