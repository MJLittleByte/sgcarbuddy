#!/usr/bin/env node
/**
 * Google Play listing graphics, rendered with the installed Chrome (playwright-core).
 *
 *   npm run store:graphic      → docs/play-store/feature-graphic-1024x500.png  (offline, any time)
 *   npm run store:screens      → docs/play-store/screenshot-01…06.png         (1080×1920)
 *
 * Screenshots need a release-like web build with live data and no mock ads, served locally, and a working internet
 * connection for map tiles and camera images. Take them in daylight (the camera images are dark at night):
 *
 *   cd ../worker && npm run dev:node                      (or point VITE_API_BASE_URL at the deployed Worker)
 *   VITE_API_BASE_URL=http://localhost:8787 VITE_AD_PLACEHOLDER=off npx vite build --outDir /tmp/scb-store
 *   npx vite preview --outDir /tmp/scb-store --port 4174 --strictPort &
 *   npm run store:screens                                 (STORE_URL=… to use another address)
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const root = new URL('..', import.meta.url);
const out = new URL('../docs/play-store/', root);
const mode = process.argv[2] ?? '--graphic';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

try {
  if (mode === '--graphic') await featureGraphic();
  else if (mode === '--screens') await screenshots();
  else throw new Error(`Unknown option ${mode} (use --graphic or --screens)`);
} finally {
  await browser.close();
}

async function featureGraphic() {
  const icon = readFileSync(new URL('public/brand/icon-tile.svg', root), 'utf8');
  const font = new URL('node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2', root).href;
  const ico = (d) => `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const features = [
    ['Parking', 'Live free lots + cost', ico('<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M9.6 16.8V7.4h3.3a2.8 2.8 0 0 1 0 5.6H9.6"/>')],
    ['EV', 'Chargers free now', ico('<path d="M13.2 2.8 5.2 13.4h6.1l-1 7.8 8.1-10.8h-6.2z" fill="currentColor"/>')],
    ['Checkpoint cams', 'Woodlands · Tuas', ico('<path d="M3.2 6.6 16 3.4a1 1 0 0 1 1.2.7l1.2 4.8a1 1 0 0 1-.7 1.2L4.9 13.3a1 1 0 0 1-1.2-.7L2.5 7.8a1 1 0 0 1 .7-1.2z"/><path d="m18.3 7.5 2.9-.7.6 2.5"/><path d="m9 12.2.9 3.6H5.3M5.3 13.8v6.7"/>')],
    ['Rain', 'Radar + next 2 hours', ico('<path d="M7 15.5a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6 1.4 3.4 3.4 0 0 1-.2 6.6z"/><path d="m8.5 18.5-1 2M12.5 18.5l-1 2M16.5 18.5l-1 2"/>')],
  ];
  const html = `<!doctype html><html><head><style>
    @font-face { font-family: Figtree; src: url(${font}) format('woff2'); font-weight: 300 900; }
    * { box-sizing: border-box; margin: 0; }
    body { width: 1024px; height: 500px; overflow: hidden; font-family: Figtree, system-ui, sans-serif; color: #fff;
      background: radial-gradient(120% 140% at 0% 0%, #3a75f5 0%, #1a56db 45%, #0f2f8f 100%); position: relative; }
    .grid { position: absolute; inset: 0; opacity: .08;
      background-image: linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px); background-size: 46px 46px; }
    .road { position: absolute; right: -80px; top: -40px; width: 620px; height: 620px; border-radius: 50%;
      border: 26px solid rgba(255,255,255,.07); }
    .left { position: absolute; left: 64px; top: 66px; width: 470px; }
    .icon svg { width: 112px; height: 112px; border-radius: 26px; box-shadow: 0 18px 40px rgba(5,20,70,.45); }
    h1 { margin-top: 26px; font-size: 58px; font-weight: 850; letter-spacing: -.03em; line-height: 1; }
    p { margin-top: 16px; font-size: 25px; font-weight: 500; line-height: 1.3; color: #dbe6ff; text-wrap: balance; }
    .cards { position: absolute; right: 56px; top: 58px; width: 380px; display: grid; gap: 14px; }
    .card { display: flex; align-items: center; gap: 16px; padding: 16px 18px; border-radius: 20px;
      background: rgba(255,255,255,.96); color: #0f1729; box-shadow: 0 10px 26px rgba(5,20,70,.28); }
    .card i { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 15px; background: #e7eeff; color: #1543b0; flex: none; }
    .card:nth-child(2) i { background: #e2f5ea; color: #0a7a43; }
    .card:nth-child(3) i { background: #fdf0db; color: #8a5200; }
    .card:nth-child(4) i { background: #e6efff; color: #2563eb; }
    .card b { display: block; font-size: 23px; font-weight: 800; letter-spacing: -.01em; }
    .card small { display: block; font-size: 17px; color: #556175; font-weight: 600; }
  </style></head><body>
    <div class="grid"></div><div class="road"></div>
    <div class="left"><div class="icon">${icon}</div><h1>SG Car Buddy</h1>
      <p>Everything a Singapore driver needs,<br>one tap away.</p></div>
    <div class="cards">${features.map(([t, s, i]) => `<div class="card"><i>${i}</i><span><b>${t}</b><small>${s}</small></span></div>`).join('')}</div>
  </body></html>`;
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: new URL('feature-graphic-1024x500.png', out).pathname });
  console.log('✓ docs/play-store/feature-graphic-1024x500.png');
}

async function screenshots() {
  const url = process.env.STORE_URL ?? 'http://127.0.0.1:4174/';
  // [file, prefs, location, action]. Bishan for parking (many HDB carparks with live counts), Orchard for EV.
  const bishan = { latitude: 1.3505, longitude: 103.8485 };
  const orchard = { latitude: 1.304, longitude: 103.8318 };
  const shots = [
    ['01-parking', { theme: 'day', vehicle: 'car' }, bishan, async () => {}],
    ['02-carpark-detail', { theme: 'day', vehicle: 'car' }, bishan, async (p) => (await p.click('ul.rows li:nth-child(2) button'), p.waitForTimeout(1500))],
    ['03-ev', { theme: 'day', vehicle: 'ev', showEvTab: true, plugs: ['type2', 'ccs2'] }, orchard, async (p) => (await p.click('nav.nav button:has-text("EV")'), p.waitForTimeout(6000))],
    ['04-cameras', { theme: 'day', vehicle: 'car' }, bishan, async (p) => (await p.click('nav.nav button:has-text("Roads")'), p.waitForTimeout(6000))],
    ['05-rain-radar', { theme: 'day', vehicle: 'car' }, bishan, async (p) => (await p.click('nav.nav button:has-text("Weather")'), p.waitForTimeout(6000))],
    ['06-night', { theme: 'night', vehicle: 'car' }, bishan, async () => {}],
  ];
  for (const [name, prefs, geo, act] of shots) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, geolocation: geo, permissions: ['geolocation'] });
    await ctx.addInitScript((p) => {
      if (!sessionStorage.getItem('init')) {
        sessionStorage.setItem('init', '1');
        localStorage.setItem('CapacitorStorage.scb.prefs', JSON.stringify({ onboarded: true, ...p }));
      }
    }, prefs);
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(8000);
    await act(page);
    if (await page.$('.map-msg')) console.warn(`  ! ${name}: the map did not load (no internet for tiles?)`);
    await page.screenshot({ path: new URL(`screenshot-${name}.png`, out).pathname });
    await ctx.close();
    console.log(`✓ docs/play-store/screenshot-${name}.png (1080×1920)`);
  }
}
