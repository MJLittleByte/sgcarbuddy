import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';

/**
 * Tweaks to OpenFreeMap's "Liberty" style, used for both day and night so the two show the same
 * detail (POIs, parks, MRT, street and place names).
 *
 * 1. hideOsmBusStops: OpenStreetMap's own bus-stop icons are dropped. Our coral dots are LTA's official
 *    stops (tappable, live times); OSM's are volunteer data, not tappable, and can be named differently.
 * 2. nightify: recolours Liberty for night in the app's dark-teal family — dark land, lighter roads,
 *    light labels with dark halos. Icons (sprites) are left as they are.
 */

const NO_BUS: ExpressionSpecification = ['!=', ['get', 'class'], 'bus'];

export function hideOsmBusStops(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((l) =>
      l.id.startsWith('poi') && 'filter' in l && l.filter ? ({ ...l, filter: ['all', l.filter, NO_BUS] } as unknown as typeof l) : l,
    ),
  };
}

/* ---------- colour helpers ---------- */

interface Hsla {
  h: number;
  s: number;
  l: number;
  a: number;
}

function parseColor(v: string): Hsla | null {
  const t = v.trim().toLowerCase();
  let r: number, g: number, b: number, a = 1;
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^#([0-9a-f]{3,8})$/))) {
    const hex = m[1]!;
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
    if (full.length === 8) a = parseInt(full.slice(6, 8), 16) / 255;
  } else if ((m = t.match(/^rgba?\(([^)]+)\)$/))) {
    const p = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
    [r, g, b] = p as [number, number, number];
    a = p[3] ?? 1;
  } else if ((m = t.match(/^hsla?\(([^)]+)\)$/))) {
    const p = m[1]!.split(/[\s,/]+/).filter(Boolean).map((x) => parseFloat(x));
    return { h: p[0]!, s: p[1]! / 100, l: p[2]! / 100, a: p[3] ?? 1 };
  } else return null;
  if ([r, g, b].some((x) => !Number.isFinite(x))) return null;
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === R ? 60 * (((G - B) / d) % 6) : max === G ? 60 * ((B - R) / d + 2) : 60 * ((R - G) / d + 4);
  return { h: (h + 360) % 360, s, l, a };
}

const fmt = ({ h, s, l, a }: Hsla) => `hsla(${Math.round(h)},${Math.round(Math.min(1, s) * 100)}%,${Math.round(Math.min(1, Math.max(0, l)) * 100)}%,${+a.toFixed(2)})`;

/** Greys and beiges become the app's dark teal; real colours (parks, water, motorways) keep their hue. */
const tint = (c: Hsla, sat: number): Pick<Hsla, 'h' | 's'> => (c.s < 0.15 || (c.h > 20 && c.h < 60 && c.s < 0.6) ? { h: 195, s: 0.22 } : { h: c.h, s: Math.min(c.s, 0.6) * sat });

type Role = 'area' | 'building' | 'outline' | 'road' | 'casing' | 'rail' | 'text' | 'halo';

function night(c: Hsla, role: Role): Hsla {
  switch (role) {
    case 'area':
      return { ...tint(c, 0.55), l: 0.065 + (1 - c.l) * 0.42, a: c.a };
    case 'building':
      return { h: 195, s: 0.2, l: 0.17, a: c.a };
    case 'outline':
      return { h: 195, s: 0.2, l: 0.22, a: c.a };
    case 'road':
      return { ...tint(c, 0.75), l: 0.25 + c.l * 0.2, a: c.a };
    case 'casing':
      return { h: 195, s: 0.18, l: 0.15, a: c.a };
    case 'rail':
      return { h: 195, s: 0.12, l: 0.36, a: c.a };
    case 'text':
      return { h: c.s < 0.15 ? 195 : c.h, s: c.s < 0.15 ? 0.12 : Math.min(c.s, 0.6), l: 0.93 - c.l * 0.45, a: 1 };
    case 'halo':
      return { h: 195, s: 0.3, l: 0.07, a: 0.9 };
  }
}

/** Recolour every colour string inside a paint value (plain or inside an expression). */
function mapColors(v: unknown, role: Role): unknown {
  if (typeof v === 'string') {
    const c = parseColor(v);
    return c ? fmt(night(c, role)) : v;
  }
  if (Array.isArray(v)) return v.map((x) => mapColors(x, role));
  return v;
}

function roleFor(id: string, type: string, prop: string): Role | null {
  if (prop === 'text-halo-color') return 'halo';
  if (prop === 'text-color') return 'text';
  if (prop === 'icon-color' || !prop.endsWith('color')) return null;
  if (id === 'building') return prop === 'fill-outline-color' ? 'outline' : 'building';
  if (type === 'line' && /^(road|bridge|tunnel)_/.test(id)) {
    if (/rail|hatching/.test(id)) return 'rail';
    return id.endsWith('_casing') ? 'casing' : 'road';
  }
  if (prop === 'fill-outline-color') return 'outline';
  return 'area';
}

export function nightify(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((l) => {
      if (l.type === 'raster') return { ...l, paint: { ...(l.paint ?? {}), 'raster-brightness-max': 0.3 } } as typeof l;
      const paint = { ...(('paint' in l && l.paint) || {}) } as Record<string, unknown>;
      for (const prop of Object.keys(paint)) {
        const role = roleFor(l.id, l.type, prop);
        if (role) paint[prop] = mapColors(paint[prop], role);
      }
      if (l.type === 'symbol') {
        paint['text-halo-color'] = fmt(night({ h: 0, s: 0, l: 0, a: 1 }, 'halo'));
        paint['text-halo-width'] = 1.3;
      }
      return { ...l, paint } as typeof l;
    }),
  };
}
