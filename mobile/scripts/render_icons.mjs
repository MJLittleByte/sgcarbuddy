/**
 * Renders the raster icons from the SVGs written by build_brand.mts: legacy launcher PNGs (Android 7.x) and the
 * 512 × 512 Google Play icon (docs/play-store/icon-512.png). Part of `npm run brand`.
 */
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
// Uses the Chrome installed on this computer (no browser download).
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
const shot = async (svg, px, path, transparent = true) => {
  const url = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  await page.setContent(`<html><body style="margin:0;background:transparent"><img id="i" src="${url}" width="${px}" height="${px}" style="display:block"></body></html>`);
  await page.waitForFunction(() => document.getElementById('i').complete);
  await page.screenshot({ path, omitBackground: transparent, clip: { x: 0, y: 0, width: px, height: px } });
};
for (const [shape, file] of [['tile', 'ic_launcher'], ['round', 'ic_launcher_round']]) {
  const svg = readFileSync(`${root}/public/brand/icon-${shape}.svg`, 'utf8');
  for (const [d, px] of Object.entries(sizes)) {
    mkdirSync(`${root}/android/app/src/main/res/mipmap-${d}`, { recursive: true });
    await shot(svg, px, `${root}/android/app/src/main/res/mipmap-${d}/${file}.png`);
  }
}
// Google Play icon: 512 × 512, full-bleed square (Play rounds the corners itself), no transparency.
const tile = readFileSync(`${root}/public/brand/icon-tile.svg`, 'utf8').replace(/<clipPath id="c">[\s\S]*?<\/clipPath>/, '').replace(' clip-path="url(#c)"', '');
mkdirSync(`${root}/../docs/play-store`, { recursive: true });
await shot(tile, 512, `${root}/../docs/play-store/icon-512.png`, false);
await browser.close();
console.log('icons done');
