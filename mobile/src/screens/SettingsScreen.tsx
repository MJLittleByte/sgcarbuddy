import { useEffect, useState } from 'react';
import type { PlugKind } from '../../../shared/contract';
import { Icon, type IconName } from '../components/Icon';
import { ScreenHeader, Segmented, Toggle } from '../components/ui';
import { mailto, PRIVACY_URL } from '../app/links';
import { BASE, isDemo } from '../lib/api/client';
import { PLUG_LABEL } from '../lib/domain/availability';
import type { Vehicle } from '../lib/domain/rates';
import { notifyPermission, requestNotify, type NotifyState } from '../lib/native';
import type { Prefs, SavedPlace, ThemePref } from '../lib/storage/store';

const VEHICLES: Array<{ id: Vehicle; label: string; icon: IconName; sub: string }> = [
  { id: 'car', label: 'Car', icon: 'car', sub: 'Car lots' },
  { id: 'ev', label: 'Electric car', icon: 'bolt', sub: 'Car lots + chargers for your plugs' },
  { id: 'motorcycle', label: 'Motorcycle', icon: 'moto', sub: 'Motorcycle lots' },
];

export function VehiclePicker({ prefs, setPrefs }: { prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void }) {
  return (
    <>
      <div className="veh-grid" role="radiogroup" aria-label="Your vehicle">
        {VEHICLES.map((v) => (
          <button
            key={v.id}
            role="radio"
            aria-checked={prefs.vehicle === v.id}
            className={`veh${prefs.vehicle === v.id ? ' on' : ''}`}
            onClick={() => setPrefs({ vehicle: v.id, ...(v.id === 'ev' ? { showEvTab: true } : {}) })}
          >
            <Icon name={v.icon} size={28} />
            <b>{v.label}</b>
            <small>{v.sub}</small>
          </button>
        ))}
      </div>
      {prefs.vehicle === 'ev' && (
        <>
          <h4 className="set-h">Your plugs</h4>
          <div className="pills">
            {(['type2', 'ccs2', 'chademo'] as PlugKind[]).map((p) => {
              const on = prefs.plugs.includes(p);
              return (
                <button key={p} className={`pill${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setPrefs({ plugs: on ? (prefs.plugs.length > 1 ? prefs.plugs.filter((x) => x !== p) : prefs.plugs) : [...prefs.plugs, p] })}>
                  {on && <Icon name="check" size={14} />}
                  {PLUG_LABEL[p]}
                  <small>{p === 'type2' ? ' AC' : ' DC'}</small>
                </button>
              );
            })}
          </div>
          <p className="list-note">Not sure? Most cars in Singapore use Type 2 (AC) and CCS2 (DC fast).</p>
        </>
      )}
    </>
  );
}

export function SettingsScreen({ prefs, setPrefs, places, onRemovePlace, onBack, onRestartIntro }: { prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void; places: SavedPlace[]; onRemovePlace: (id: string) => void; onBack: () => void; onRestartIntro: () => void }) {
  const [perm, setPerm] = useState<NotifyState>('prompt');
  useEffect(() => void notifyPermission().then(setPerm), []);
  return (
    <div className="screen settings">
      <ScreenHeader title="Settings" onBack={onBack} />
      <div className="scr-body">
        <h3 className="set-sec">Your vehicle</h3>
        <VehiclePicker prefs={prefs} setPrefs={setPrefs} />

        <h3 className="set-sec">Tabs</h3>
        <div className="set-card">
          <div className="set-row">
            <span>
              <b>Show EV tab</b>
              <small>EV chargers stay visible inside each carpark's details either way</small>
            </span>
            <Toggle on={prefs.showEvTab} onChange={(v) => setPrefs({ showEvTab: v })} label="Show EV tab" />
          </div>
        </div>

        <h3 className="set-sec">Appearance</h3>
        <Segmented<ThemePref>
          label="Appearance"
          value={prefs.theme}
          onChange={(theme) => setPrefs({ theme })}
          options={[
            { id: 'auto', label: 'Auto', icon: 'monitor' },
            { id: 'day', label: 'Day', icon: 'sun' },
            { id: 'night', label: 'Night', icon: 'moon' },
          ]}
        />
        <p className="list-note">Auto follows your phone's dark mode. Day is the bright map; Night is the dark map with glowing pins.</p>

        <h3 className="set-sec">Navigation app</h3>
        <Segmented
          label="Navigation app"
          value={prefs.navApp}
          onChange={(navApp) => setPrefs({ navApp })}
          options={[
            { id: 'ask', label: 'Ask' },
            { id: 'google', label: 'Google Maps' },
            { id: 'waze', label: 'Waze' },
          ]}
        />

        <h3 className="set-sec">Walking pace</h3>
        <Segmented
          label="Walking pace"
          value={String(prefs.walkingPaceMpm)}
          onChange={(v) => setPrefs({ walkingPaceMpm: Number(v) })}
          options={[
            { id: '60', label: 'Relaxed' },
            { id: '75', label: 'Normal' },
            { id: '90', label: 'Brisk' },
          ]}
        />

        <h3 className="set-sec">Parking reminders</h3>
        <div className="set-card">
          <div className="set-row">
            <span>
              <b>Notifications</b>
              <small>{perm === 'granted' ? 'Allowed' : perm === 'denied' ? 'Blocked by your phone: turn them on in system settings' : perm === 'unsupported' ? 'Not available here' : 'Asked when you set your first reminder'}</small>
            </span>
            {perm === 'prompt' && (
              <button className="btn small" onClick={() => void requestNotify().then(setPerm)}>
                Allow
              </button>
            )}
          </div>
          <div className="set-row">
            <span>
              <b>Remind me before</b>
              <small>How early, before a rate change or free parking ends</small>
            </span>
            <Segmented
              label="Reminder lead time"
              value={String(prefs.reminderLeadMin)}
              onChange={(v) => setPrefs({ reminderLeadMin: Number(v) })}
              options={[
                { id: '5', label: '5' },
                { id: '10', label: '10' },
                { id: '15', label: '15 min' },
              ]}
            />
          </div>
        </div>

        {places.length > 0 && (
          <>
            <h3 className="set-sec">Saved places</h3>
            <div className="set-card">
              {places.map((p) => (
                <div key={p.id} className="set-row">
                  <span>
                    <b>
                      <Icon name={p.icon} size={16} /> {p.label}
                    </b>
                    {p.address && <small>{p.address}</small>}
                  </span>
                  <button className="ib" onClick={() => onRemovePlace(p.id)} aria-label={`Remove ${p.label}`}>
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <h3 className="set-sec">About</h3>
        <div className="set-card about">
          <p>
            <b>SG Car Buddy</b> {__APP_VERSION__}
            {isDemo ? ' · demo data' : ''}
          </p>
          <p>
            Contains information from LTA DataMall, data.gov.sg (HDB, NEA, PUB), URA and OneMap (Singapore Land Authority), made available under the{' '}
            <a href="https://data.gov.sg/open-data-licence" target="_blank" rel="noreferrer">
              Singapore Open Data Licence v1.0
            </a>
            . Map © OpenFreeMap, © OpenMapTiles, data © OpenStreetMap contributors.
          </p>
          <p>Not affiliated with LTA, HDB, URA, NEA, PUB or SLA. Lots, prices and travel times are for information only: check the signs.</p>
          <p>Your location stays on this phone. The app downloads island-wide data and matches it here.</p>
          <p className="about-links">
            <a href={PRIVACY_URL} target="_blank" rel="noreferrer">
              Privacy policy
            </a>
            <a href={mailto(`SG Car Buddy ${__APP_VERSION__}: feedback`)}>Contact support</a>
          </p>
          {!isDemo && <p className="faint">Server: {BASE.replace(/^https?:\/\//, '')}</p>}
        </div>
        <button className="btn block" onClick={onRestartIntro}>
          Show the welcome screens again
        </button>
      </div>
    </div>
  );
}
