/**
 * Roads tab: a full-screen page (no map). The LTA checkpoint cameras edge to edge first (tap for the full-screen
 * viewer), then road alerts within 4 km of you, then expressway travel times.
 */
import { useState } from 'react';
import type { Camera, CamerasResponse, RoadsResponse } from '../../../shared/contract';
import { InFeedAd } from '../components/AdSlot';
import { Icon } from '../components/Icon';
import { Fresh } from '../components/ui';
import { clock } from '../lib/domain/format';
import { formatDistance, type LatLng } from '../lib/domain/geo';
import { ROAD_ALERT_RADIUS_M, roadAlertsNear, type RoadAlert } from '../lib/domain/roads';

const GROUPS: Array<{ id: Camera['group']; title: string }> = [
  { id: 'Woodlands', title: 'Woodlands Checkpoint' },
  { id: 'Tuas', title: 'Tuas Checkpoint' },
  { id: 'Sentosa', title: 'Sentosa Gateway' },
  { id: 'Other', title: 'Other cameras' },
];

const KM = ROAD_ALERT_RADIUS_M / 1000;
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());

export function RoadsPage({
  cameras,
  roads,
  at,
  placeLabel,
  now,
  locationOff,
  onLocate,
  onOpenCamera,
  onOpenAlert,
}: {
  cameras: { data: CamerasResponse | null; receivedAt: number | null; error: Error | null; refresh: () => void };
  roads: { data: RoadsResponse | null; error: Error | null; refresh: () => void };
  at: LatLng | null;
  placeLabel: string;
  now: number;
  locationOff: boolean;
  onLocate: () => void;
  onOpenCamera: (id: string) => void;
  onOpenAlert: (a: RoadAlert) => void;
}) {
  const [allTimes, setAllTimes] = useState(false);
  const r = roads.data;
  const alerts = roadAlertsNear(r, at);
  const cams = cameras.data?.cameras ?? [];
  const times = r?.checkpoints ?? [];
  const xways = r?.expressways ?? [];
  let shown = 0;

  return (
    <div className="roads-page" aria-label="Roads">
      <section className="rp-sec" aria-labelledby="rp-cams">
        <header className="rp-head">
          <h2 id="rp-cams">Checkpoint cameras</h2>
          <Fresh at={cameras.receivedAt} now={now} staleAfterMs={10 * 60_000} error={cameras.error} onRetry={cameras.refresh} prefix={cams.length ? `All ${cams.length} LTA cameras` : 'LTA cameras'} />
        </header>
        {!cams.length && <p className="list-note">{cameras.error ? "Can't load the cameras right now." : 'Loading cameras…'}</p>}
        {GROUPS.map((g) => {
          const list = cams.filter((c) => c.group === g.id);
          if (!list.length) return null;
          const t = times.find((x) => x.checkpoint === g.id);
          return (
            <div key={g.id} className="cam-group" role="group" aria-label={g.title}>
              <h3 className="rp-grp">
                <span>{g.title}</span>
                {t && (
                  <span className="tt" title={`LTA estimated travel time on the ${t.via} towards the checkpoint`}>
                    <Icon name="clock" size={13} />
                    {t.via} {t.minutes} min
                  </span>
                )}
              </h3>
              {list.map((c) => {
                shown++;
                return (
                  <div key={c.id} className="cam-slot">
                    <button className="cam" onClick={() => onOpenCamera(c.id)} aria-label={`${c.name}. Open full screen.`}>
                      <span className="img">
                        <img src={c.image} alt="" loading="lazy" decoding="async" />
                        <span className="xp" aria-hidden="true">
                          <Icon name="expand" size={16} />
                        </span>
                        <span className="cam-live">
                          <i className="live" aria-hidden="true" />
                          {c.takenAt ? clock(Date.parse(c.takenAt)) : 'Live'}
                        </span>
                      </span>
                      <span className="cap">
                        <b>{c.name}</b>
                        <small>Camera {c.id} · tap for full screen</small>
                      </span>
                    </button>
                    {shown === 2 && <InFeedAd />}
                  </div>
                );
              })}
            </div>
          );
        })}
        {cams.length > 0 && <p className="rp-src">LTA publishes {cams.length} cameras (checkpoints and Sentosa); most expressway cameras were switched off on 30 Jun 2026.</p>}
      </section>

      <section className="rp-sec" aria-labelledby="rp-alerts">
        <header className="rp-head">
          <h2 id="rp-alerts">Road alerts</h2>
          <span className="rp-sub">{at ? `Within ${KM} km of ${placeLabel}` : `Within ${KM} km of you`}</span>
        </header>
        {!at ? (
          <div className="rp-note">
            <Icon name="locate" size={20} />
            <span>{locationOff ? 'Location is off. Turn it on, or search a place, to see accidents, breakdowns and roadworks near you.' : 'Finding your location…'}</span>
            {locationOff && (
              <button className="btn small" onClick={onLocate}>
                Use my location
              </button>
            )}
          </div>
        ) : !r ? (
          <div className="rp-note">
            <Icon name="refresh" size={20} />
            <span>{roads.error ? "Can't load road alerts right now." : 'Loading road alerts…'}</span>
            {roads.error && (
              <button className="btn small" onClick={roads.refresh}>
                Retry
              </button>
            )}
          </div>
        ) : alerts.length === 0 ? (
          <div className="rp-clear">
            <span className="rp-clear-ic" aria-hidden="true">
              <Icon name="check" size={20} />
            </span>
            <span>
              <b>All clear</b>
              <small>No accidents, breakdowns, roadworks or faulty traffic lights reported within {KM} km.</small>
            </span>
          </div>
        ) : (
          <ul className="ra-list">
            {alerts.map((a) => (
              <li key={a.id}>
                <button className={`ra sev-${a.severity}`} onClick={() => onOpenAlert(a)}>
                  <span className="ra-ic" aria-hidden="true">
                    <Icon name={a.icon} size={20} />
                  </span>
                  <span className="ra-tx">
                    <b>{a.title}</b>
                    <small>{a.detail}</small>
                  </span>
                  <span className="ra-meta">
                    <b>{formatDistance(a.distanceM)}</b>
                    {a.at && <small>{clock(Date.parse(a.at))}</small>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {r && <p className="rp-src">LTA traffic incidents and faulty traffic lights, PUB flood alerts.</p>}
      </section>

      {xways.length > 0 && (
        <section className="rp-sec" aria-labelledby="rp-times">
          <header className="rp-head inline">
            <h2 id="rp-times">Expressway travel times</h2>
            <button className="link" onClick={() => setAllTimes((v) => !v)}>
              {allTimes ? 'Fewer' : `All ${xways.length}`}
            </button>
          </header>
          <ul className="times">
            {(allTimes ? xways : xways.filter((e) => ['AYE', 'BKE', 'PIE', 'CTE', 'ECP'].includes(e.expressway))).map((e) => (
              <li key={`${e.expressway}${e.direction}`}>
                <b>{e.expressway}</b>
                <span>towards {titleCase(e.towards)}</span>
                <em>{e.minutes} min</em>
              </li>
            ))}
          </ul>
          <p className="rp-src">LTA estimated travel times.</p>
        </section>
      )}
    </div>
  );
}
