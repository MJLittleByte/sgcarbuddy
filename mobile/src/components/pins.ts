/**
 * Map pin images, drawn on a canvas on demand (MapLibre `styleimagemissing`) so every pin is crisp and
 * carries its own number. Image id: `pin|<kind>|<level>|<label>|<selected 0/1>`.
 *  - Day (concept A): white pill, coloured "P" / bolt tile, dark text; selected = dark pill.
 *  - Night (concept C): dark glass pill with an availability-coloured ring and a soft glow.
 */
import type { Level } from '../lib/domain/availability';

export type PinKind = 'cp' | 'ev';

const PALETTE = {
  light: {
    plenty: '#0d9a55', limited: '#d97c00', few: '#dc3439', full: '#dc3439', none: '#8a94a6',
    fill: '#ffffff', ink: '#0f1729', muted: '#6b7489', edge: 'rgba(15,23,41,0.18)', shadow: 'rgba(15,23,41,0.28)',
    selFill: '#0f1729', selInk: '#ffffff',
  },
  dark: {
    plenty: '#2ff59a', limited: '#ffc94a', few: '#ff5c7a', full: '#ff5c7a', none: '#6b7491',
    fill: 'rgba(12,18,34,0.94)', ink: '#eef2ff', muted: '#9aa3bf', edge: 'rgba(255,255,255,0.16)', shadow: 'rgba(0,0,0,0.5)',
    selFill: 'rgba(12,18,34,0.98)', selInk: '#ffffff',
  },
} as const;

const BOLT = new Path2D('M13.2 2.8 5.2 13.4h6.1l-1 7.8 8.1-10.8h-6.2z');

export const PIN_RATIO = 2;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function fonts(dark: boolean) {
  return {
    ui: `"Figtree Variable", system-ui, sans-serif`,
    num: dark ? `"Space Grotesk Variable", "Figtree Variable", system-ui, sans-serif` : `"Figtree Variable", system-ui, sans-serif`,
  };
}

/** Draws one pin; returns ImageData at PIN_RATIO. */
export function drawPin(id: string, dark: boolean): ImageData | null {
  const [, kind, level = 'none', label = '', sel = '0'] = id.split('|') as [string, PinKind, Level, string, string];
  const P = dark ? PALETTE.dark : PALETTE.light;
  const s = PIN_RATIO;
  const selected = sel === '1';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const f = fonts(dark);

  // Pill: [tile][label] with a pointer underneath.
  const H = selected ? 34 : 28;
  const tile = selected ? 24 : 20;
  const fontSize = selected ? 17 : 14;
  ctx.font = `800 ${fontSize}px ${f.num}`;
  const textW = Math.ceil(ctx.measureText(label).width);
  const pad = dark ? 7 : 4;
  const pointer = 6;
  const W = 4 + tile + 6 + textW + (selected ? 11 : 9);
  canvas.width = (W + pad * 2) * s;
  canvas.height = (H + pointer + pad) * s;
  ctx.scale(s, s);
  const color = P[level] ?? P.none;
  const x = pad;
  const y = pad;
  const r = H / 2;

  // Body + pointer
  ctx.shadowColor = dark ? color : P.shadow;
  ctx.shadowBlur = dark ? (selected ? 14 : 8) : selected ? 6 : 4;
  ctx.shadowOffsetY = dark ? 0 : 1;
  ctx.fillStyle = selected ? P.selFill : P.fill;
  roundRect(ctx, x, y, W, H, r);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + W / 2 - 6, y + H - 1);
  ctx.lineTo(x + W / 2, y + H + pointer);
  ctx.lineTo(x + W / 2 + 6, y + H - 1);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  if (dark) {
    ctx.lineWidth = selected ? 2.5 : 1.6;
    ctx.strokeStyle = color;
    roundRect(ctx, x + 0.8, y + 0.8, W - 1.6, H - 1.6, r - 0.8);
    ctx.stroke();
  } else if (!selected) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = P.edge;
    roundRect(ctx, x + 0.5, y + 0.5, W - 1, H - 1, r - 0.5);
    ctx.stroke();
  }

  // Tile
  const tx = x + 4;
  const ty = y + (H - tile) / 2;
  ctx.fillStyle = color;
  roundRect(ctx, tx, ty, tile, tile, tile * 0.32);
  ctx.fill();
  const tileInk = dark ? '#05101c' : '#ffffff';
  ctx.fillStyle = tileInk;
  if (kind === 'ev') {
    ctx.save();
    const k = (tile * 0.78) / 24;
    ctx.translate(tx + (tile - 24 * k) / 2, ty + (tile - 24 * k) / 2);
    ctx.scale(k, k);
    ctx.fill(BOLT);
    ctx.restore();
  } else {
    ctx.font = `900 ${Math.round(tile * 0.68)}px ${f.ui}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', tx + tile / 2, ty + tile / 2 + 1);
  }

  // Label
  ctx.font = `800 ${fontSize}px ${f.num}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = selected ? P.selInk : level === 'none' ? P.muted : P.ink;
  ctx.fillText(label, tx + tile + 6, y + H / 2 + 1);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export const pinId = (kind: PinKind, level: Level, label: string, selected: boolean) => `pin|${kind}|${level}|${label}|${selected ? 1 : 0}`;
