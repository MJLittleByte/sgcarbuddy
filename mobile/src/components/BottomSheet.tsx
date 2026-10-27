import { useEffect, useRef, useState, type ReactNode } from 'react';

export type Snap = 'peek' | 'half' | 'full';
const ORDER: Snap[] = ['peek', 'half', 'full'];

/**
 * Persistent (non-modal) bottom sheet over the map with three snap points. Drag the handle/header, or tap
 * the handle to step up. Height-based (not transform), so the list inside is always fully scrollable.
 * `pinHeader={false}` scrolls the header with the content (for short panels whose header is most of the peek),
 * and scrolling a peeking sheet opens it to half height.
 */
export function BottomSheet({
  snap,
  onSnap,
  heights,
  header,
  children,
  label,
  pinHeader = true,
}: {
  snap: Snap;
  onSnap: (s: Snap) => void;
  heights: Record<Snap, number>;
  header: ReactNode;
  children: ReactNode;
  label: string;
  pinHeader?: boolean;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ y: number; h: number; t: number } | null>(null);
  const last = useRef<{ y: number; t: number }>({ y: 0, t: 0 });
  const prev = useRef<{ y: number; t: number }>({ y: 0, t: 0 });
  const bodyRef = useRef<HTMLDivElement>(null);
  const h = drag ?? heights[snap];

  useEffect(() => {
    if (snap !== 'full') bodyRef.current?.scrollTo({ top: 0 });
  }, [snap]);

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, a')) return;
    start.current = { y: e.clientY, h: heights[snap], t: performance.now() };
    last.current = { y: e.clientY, t: performance.now() };
    prev.current = last.current;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dy = e.clientY - start.current.y;
    if (drag == null && Math.abs(dy) < 4) return;
    prev.current = last.current;
    last.current = { y: e.clientY, t: performance.now() };
    setDrag(Math.max(heights.peek - 40, Math.min(heights.full, start.current.h - dy)));
  };
  const onUp = () => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    if (drag == null) return;
    const v = (last.current.y - prev.current.y) / Math.max(1, last.current.t - prev.current.t);
    const cur = drag;
    setDrag(null);
    let next: Snap;
    if (v > 0.6) next = [...ORDER].reverse().find((k) => heights[k] < cur) ?? 'peek';
    else if (v < -0.6) next = ORDER.find((k) => heights[k] > cur) ?? 'full';
    else next = ORDER.reduce((best, k) => (Math.abs(heights[k] - cur) < Math.abs(heights[best] - cur) ? k : best), snap);
    onSnap(next);
  };

  const cycle = () => onSnap(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'half');

  return (
    <section className={`bsheet${drag != null ? ' dragging' : ''}`} style={{ height: h }} aria-label={label} data-snap={snap}>
      <div className="bsheet-grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <button className="bsheet-handle" aria-label={snap === 'full' ? 'Show more map' : 'Show more list'} onClick={cycle}>
          <span />
        </button>
        {pinHeader && header}
      </div>
      <div className="bsheet-body" ref={bodyRef} onScroll={(e) => snap === 'peek' && drag == null && e.currentTarget.scrollTop > 12 && onSnap('half')}>
        {!pinHeader && header}
        {children}
      </div>
    </section>
  );
}
