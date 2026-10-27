import { useEffect, useRef, useState } from 'react';
import type { Camera } from '../../../shared/contract';
import { useBackHandler } from '../app/platform';
import { Icon } from '../components/Icon';
import { ago, clock } from '../lib/domain/format';

/** Full-screen camera viewer: pinch / double-tap zoom, swipe between all cameras, auto-refresh. Ad-free. */
export function CameraViewer({ cameras, startId, now, receivedAt, onRefresh, onClose }: { cameras: Camera[]; startId: string; now: number; receivedAt: number | null; onRefresh: () => void; onClose: () => void }) {
  const [idx, setIdx] = useState(() => Math.max(0, cameras.findIndex((c) => c.id === startId)));
  const [zoom, setZoom] = useState({ s: 1, x: 0, y: 0 });
  const [failed, setFailed] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ d0: number; s0: number; x0: number; y0: number; px: number; py: number } | null>(null);
  const swipe = useRef<{ x: number; t: number } | null>(null);
  useBackHandler(true, onClose);

  const cam = cameras[idx];
  useEffect(() => {
    setZoom({ s: 1, x: 0, y: 0 });
    setFailed(false);
  }, [idx]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(cameras.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [cameras.length, onClose]);

  if (!cam) return null;
  const go = (d: number) => setIdx((i) => Math.min(cameras.length - 1, Math.max(0, i + d)));

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }];
      gesture.current = { d0: Math.hypot(a.x - b.x, a.y - b.y), s0: zoom.s, x0: zoom.x, y0: zoom.y, px: e.clientX, py: e.clientY };
      swipe.current = null;
    } else {
      gesture.current = { d0: 0, s0: zoom.s, x0: zoom.x, y0: zoom.y, px: e.clientX, py: e.clientY };
      swipe.current = zoom.s === 1 ? { x: e.clientX, t: performance.now() } : null;
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const pts = [...pointers.current.values()];
    if (pts.length === 2 && g.d0) {
      const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }];
      const s = Math.min(5, Math.max(1, (g.s0 * Math.hypot(a.x - b.x, a.y - b.y)) / g.d0));
      setZoom((z) => ({ ...z, s }));
    } else if (zoom.s > 1) {
      setZoom({ s: zoom.s, x: g.x0 + (e.clientX - g.px), y: g.y0 + (e.clientY - g.py) });
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const sw = swipe.current;
    if (sw && pointers.current.size === 0) {
      const dx = e.clientX - sw.x;
      if (Math.abs(dx) > 60 && performance.now() - sw.t < 600) go(dx < 0 ? 1 : -1);
    }
    if (pointers.current.size === 0) {
      gesture.current = null;
      swipe.current = null;
      if (zoom.s <= 1.02) setZoom({ s: 1, x: 0, y: 0 });
    }
  };

  const taken = cam.takenAt ? Date.parse(cam.takenAt) : null;
  const old = taken != null && now - taken > 10 * 60_000;
  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={`Camera: ${cam.name}`}>
      <header className="v-head">
        <button className="ib" onClick={onClose} aria-label="Close">
          <Icon name="x" size={22} />
        </button>
        <span className="v-title">
          <b>{cam.name}</b>
          <small>
            {cam.group} · {idx + 1} of {cameras.length}
          </small>
        </span>
        <button className="ib" onClick={onRefresh} aria-label="Refresh image">
          <Icon name="refresh" size={20} />
        </button>
      </header>
      <div
        className="v-stage"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={() => setZoom((z) => (z.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.5, x: 0, y: 0 }))}
        onWheel={(e) => setZoom((z) => ({ ...z, s: Math.min(5, Math.max(1, z.s * (e.deltaY < 0 ? 1.15 : 0.87))) }))}
      >
        {failed ? (
          <p className="v-fail">Image unavailable right now. It refreshes every minute.</p>
        ) : (
          <img
            key={cam.image}
            src={cam.image}
            alt={`Live traffic camera: ${cam.name}`}
            draggable={false}
            onError={() => setFailed(true)}
            style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`, opacity: old ? 0.6 : 1 }}
          />
        )}
      </div>
      <footer className="v-foot">
        <button className="ib" disabled={idx === 0} onClick={() => go(-1)} aria-label="Previous camera">
          <Icon name="left" size={22} />
        </button>
        <span className="v-meta">
          <span>
            <i className={old ? '' : 'live'} />
            {taken ? `Taken ${clock(taken)}` : 'Time not published'}
            {old ? ' · older than 10 min' : ''}
          </span>
          <small>{receivedAt ? `Checked ${ago(receivedAt, now)} · refreshes every minute` : 'Loading…'} · Turn your phone sideways for full screen, pinch to zoom</small>
        </span>
        <button className="ib" disabled={idx === cameras.length - 1} onClick={() => go(1)} aria-label="Next camera">
          <Icon name="right" size={22} />
        </button>
      </footer>
      <p className="v-src">Image: LTA traffic camera {cam.id}</p>
    </div>
  );
}
