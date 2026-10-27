/**
 * SG Car Buddy logo mark — the single source for every logo asset.
 * "Pin": a map pin carrying a bold P (parking, right here), flat with a quiet half-tone fold.
 * Coordinates are in Android adaptive-icon units (108 × 108, centre 54,54). Launcher icons scale the mark by
 * MARK_SCALE so it sits well inside the 66dp safe zone. Edit here, then run `npm run brand`.
 * Alternatives considered: docs/design/logo/index.html.
 */

export const BRAND = {
  /** Day accent (concept A) and the solid splash colour. */
  blue: '#1A56DB',
  /** Icon tile gradient, top-left → bottom-right. */
  blueTop: '#3A75F5',
  blueBottom: '#1240B8',
  /** Right-hand "fold" of the pin. */
  shade: '#DCE6FF',
  /** Night accent. */
  cyan: '#4BE3FF',
  white: '#FFFFFF',
} as const;

/** Pin outline (head circle r 20 at 54,48; rounded tip at 54,80.5). */
export const PIN = 'M54 80.5C52.9 80.5 51.9 80 51.2 79.1 45.4 71.6 34 57.6 34 48a20 20 0 0 1 40 0c0 9.6-11.4 23.6-17.2 31.1-.7.9-1.7 1.4-2.8 1.4z';
/** Right half of the pin, drawn in BRAND.shade for depth. */
export const SHADE = 'M54 28a20 20 0 0 1 20 20c0 9.6-11.4 23.6-17.2 31.1-.7.9-1.7 1.4-2.8 1.4z';
/** The P: outer shape + counter (fill-rule evenodd). Optically centred on the pin head. */
export const P = 'M47.6 37H55.5a7.6 7.6 0 0 1 0 15.2H51.4v5.4a3.2 3.2 0 0 1-6.4 0V39.6a2.6 2.6 0 0 1 2.6-2.6zM51.4 42v5.2h3.7a2.6 2.6 0 0 0 0-5.2z';

/** Launcher icon scale around the centre (keeps the mark ~62% of the visible tile). */
export const MARK_SCALE = 0.86;

/** Tight square box around the bare mark, for showing it without a tile (boot screen, in-app). */
export const MARK_VIEWBOX = '25 25 58 58';

/** SVG elements for the bare mark. `p` is the colour of the P (normally the tile colour behind it). */
export function markSvg(p: string = BRAND.blue): string {
  return `<path d="${PIN}" fill="${BRAND.white}"/><path d="${SHADE}" fill="${BRAND.shade}"/><path d="${P}" fill="${p}" fill-rule="evenodd"/>`;
}
