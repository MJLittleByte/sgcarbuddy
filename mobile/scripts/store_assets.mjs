#!/usr/bin/env node
/**
 * Google Play listing graphics, rendered with the installed Chrome (playwright-core).
 *
 *   npm run store:graphic      → docs/play-store/feature-graphic-1024x500.png  (offline, any time)
 *   npm run store:screens      → docs/play-store/raw/NN-*.png (plain captures) and
 *                                docs/play-store/screenshot-NN-*.png (captioned, the ones to upload). All 1080×1920.
 *   npm run store:frame        → re-captions the existing raw captures only (after editing SCENES' captions)
 *
 * Screenshots need a release-like web build with live data and no mock ads, served locally, and a working internet
 * connection for map tiles and camera images. Take them in daylight (the camera images are dark at night):
 *
 *   cd ../worker && npm run dev:node                      (or point VITE_API_BASE_URL at the deployed Worker)
 *   VITE_API_BASE_URL=http://localhost:8787 VITE_AD_PLACEHOLDER=off npx vite build --outDir /tmp/scb-store
 *   npx vite preview --outDir /tmp/scb-store --port 4174 --strictPort &
 *   npm run store:screens                                 (STORE_URL=… to use another address)
 *
 * Extra Chrome switches (for example a proxy setting) can be passed in CHROME_ARGS.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const root = new URL('..', import.meta.url);
const out = new URL('../docs/play-store/', root);
const mode = process.argv[2] ?? '--graphic';
const extraArgs = (process.env.CHROME_ARGS ?? '').split(/\s+/).filter(Boolean);
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...extraArgs] });
const font = new URL('node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2', root).href;


async function featureGraphic() {
  const icon = readFileSync(new URL('public/brand/icon-tile.svg', root), 'utf8');
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

/* ---------------- Play screenshots ---------------- */

const raw = new URL('raw/', out);
const MIN = 60_000;
/** Places with lots of live HDB carparks (parking) and chargers (EV). */
const CLEMENTI = { latitude: 1.315, longitude: 103.765 };
const ORCHARD = { latitude: 1.304, longitude: 103.8318 };
const ALL_TABS = { showEvTab: true };

/**
 * One entry per Play screenshot, in upload order. `title` / `sub` are baked into the captioned image.
 * `prefs` are written to the app's storage before it starts; `parked: true` saves a parked car first (as a user would); `act` drives the app to the screen.
 */
const SCENES = [
  {
    file: '01-parking',
    title: 'Live free lots\nnear you',
    sub: 'HDB, URA and mall carparks, with the cost of your stay',
    prefs: { theme: 'day', vehicle: 'car', ...ALL_TABS },
    geo: CLEMENTI,
  },
  {
    file: '02-carpark',
    title: 'Know before\nyou drive in',
    sub: "Live lots, what you'll pay, height limit and chargers",
    prefs: { theme: 'day', vehicle: 'car', ...ALL_TABS },
    geo: CLEMENTI,
    act: async (p) => {
      await p.click('ul.rows li:nth-child(1) button');
      await p.waitForTimeout(1500);
    },
  },
  {
    file: '03-ev',
    title: 'Find a free\ncharger',
    sub: 'Live status for your plug, with kW and price',
    prefs: { theme: 'day', vehicle: 'ev', plugs: ['type2', 'ccs2'], ...ALL_TABS },
    geo: ORCHARD,
    act: async (p) => {
      await p.click('nav.nav button:has-text("EV")');
      await p.waitForTimeout(8000);
    },
  },
  {
    file: '04-cameras',
    title: 'Checkpoint jam?\nSee it first',
    sub: 'Live Woodlands, Tuas and Sentosa cameras, and road alerts near you',
    prefs: { theme: 'day', vehicle: 'car', ...ALL_TABS },
    geo: CLEMENTI,
    act: async (p) => {
      await p.click('nav.nav button:has-text("Roads")');
      await p.waitForFunction(() => [...document.querySelectorAll('.cam img')].slice(0, 2).every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 20_000 }).catch(() => {});
      await p.waitForTimeout(1000);
    },
  },
  {
    file: '05-rain',
    title: 'Will it rain\non you?',
    sub: 'Rain radar, rain near you and the next 2 hours',
    prefs: { theme: 'day', vehicle: 'car', ...ALL_TABS },
    geo: CLEMENTI,
    act: async (p) => {
      await p.click('nav.nav button:has-text("Weather")');
      await p.waitForTimeout(6000);
      // Stop the animation on the latest frame.
      await p.click('.radar-ctl .ticks button:last-child').catch(() => {});
      // Half height: rain now, the next 2 hours and the 4-day outlook, with the radar above.
      await p.click('.bsheet-handle');
      await p.waitForTimeout(1500);
    },
  },
  {
    file: '06-parked',
    title: 'Remember where\nyou parked',
    sub: 'Deck, lot, time and the cost so far, with reminders',
    prefs: { theme: 'day', vehicle: 'car', ...ALL_TABS },
    geo: CLEMENTI,
    parked: true,
    act: async (p) => {
      await p.click('.parked-bar');
      await p.waitForTimeout(1200);
    },
  },
  {
    file: '07-night',
    title: 'Easy on the eyes\nat night',
    sub: 'Day and Night looks, switching automatically. No account needed.',
    dark: true,
    prefs: { theme: 'night', vehicle: 'car', ...ALL_TABS },
    geo: CLEMENTI,
    parked: true,
  },
];

async function captureScreens() {
  const url = process.env.STORE_URL ?? 'http://127.0.0.1:4174/';
  mkdirSync(raw, { recursive: true });
  for (const scene of selected()) {
    // 360×640 at 3× = 1080×1920 (9:16): a typical phone in CSS pixels, valid for Play on its own too.
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, geolocation: scene.geo, permissions: ['geolocation', 'notifications'] });
    // Fresh profile per scene: settings set once (a reload keeps what the app saved since, e.g. a parked car).
    await ctx.addInitScript((prefs) => {
      if (sessionStorage.getItem('init')) return;
      sessionStorage.setItem('init', '1');
      localStorage.setItem('CapacitorStorage.scb.prefs', JSON.stringify({ onboarded: true, ...prefs }));
    }, scene.prefs);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await page.waitForTimeout(8000);
    if (scene.parked) await parkAtNearest(page);
    await scene.act?.(page);
    if (await page.$('.map-msg')) console.warn(`  ! ${scene.file}: the map did not load (no internet for map tiles?)`);
    if (errors.length) console.warn(`  ! ${scene.file}: ${errors.join(' | ')}`);
    await page.screenshot({ path: new URL(`${scene.file}.png`, raw).pathname });
    await ctx.close();
    console.log(`✓ docs/play-store/raw/${scene.file}.png`);
  }
}

/** Saves "I've parked here" at the nearest carpark, as a user would (note + one reminder), backdated 1 h 25 min. */
async function parkAtNearest(page) {
  await page.click('ul.rows li:nth-child(1) button');
  await page.waitForTimeout(1000);
  await page.click(`button:has-text("I've parked here")`);
  await page.waitForTimeout(600);
  await page.fill('.field input', 'Level 4, near lift B');
  await page.click('.pill:has-text("1 h ago")').catch(() => {});
  await page.click('.pills >> nth=1 >> .pill:has-text("3 h")').catch(() => {});
  await page.click('.sheet .btn.primary');
  await page.waitForTimeout(800);
  // Backdate the start (and its reminders) to 1 h 25 min ago for a realistic timer, then reload with that session.
  await page.evaluate((min) => {
    const key = 'CapacitorStorage.scb.parked';
    const s = JSON.parse(localStorage.getItem(key));
    const shift = Date.now() - 85 * min - s.startedAt;
    s.startedAt += shift;
    for (const r of s.reminders) {
      r.at += shift;
      r.eventAt += shift;
    }
    localStorage.setItem(key, JSON.stringify(s));
  }, MIN);
  await page.reload();
  await page.waitForTimeout(8000);
}

/** STORE_ONLY=05,06 limits a run to those scenes. */
function selected() {
  const only = (process.env.STORE_ONLY ?? '').split(',').filter(Boolean);
  return only.length ? SCENES.filter((sc) => only.some((o) => sc.file.startsWith(o))) : SCENES;
}

async function frameScreens() {
  for (const scene of selected()) {
    const png = readFileSync(new URL(`${scene.file}.png`, raw)).toString('base64');
    const bg = scene.dark
      ? 'radial-gradient(120% 90% at 50% 0%, #1b2a4d 0%, #0b1224 55%, #05080f 100%)'
      : 'radial-gradient(120% 90% at 50% 0%, #3a75f5 0%, #1a56db 50%, #1240b8 100%)';
    const html = `<!doctype html><html><head><style>
      @font-face { font-family: Figtree; src: url(${font}) format('woff2'); font-weight: 300 900; }
      * { box-sizing: border-box; margin: 0; }
      body { width: 1080px; height: 1920px; overflow: hidden; background: ${bg}; font-family: Figtree, system-ui, sans-serif; color: #fff; }
      .cap { position: absolute; left: 70px; right: 70px; top: 104px; text-align: center; }
      h1 { font-size: 88px; line-height: 1.04; font-weight: 850; letter-spacing: -0.025em; white-space: pre-line; }
      p { margin-top: 26px; font-size: 40px; line-height: 1.3; font-weight: 500; color: ${scene.dark ? '#a9c6ff' : '#dbe6ff'}; text-wrap: balance; }
      .phone { position: absolute; left: 140px; top: 492px; width: 800px; padding: 13px; border-radius: 64px;
        background: ${scene.dark ? '#1c2438' : '#0d1830'}; box-shadow: 0 40px 90px rgba(3, 10, 40, .5), inset 0 0 0 2px rgba(255,255,255,.08); }
      .phone img { display: block; width: 774px; height: 1376px; border-radius: 52px; }
    </style></head><body>
      <div class="cap"><h1>${esc(scene.title)}</h1><p>${esc(scene.sub)}</p></div>
      <div class="phone"><img src="data:image/png;base64,${png}"></div>
    </body></html>`;
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: new URL(`screenshot-${scene.file}.png`, out).pathname });
    await page.close();
    console.log(`✓ docs/play-store/screenshot-${scene.file}.png (1080×1920)`);
  }
}

function esc(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

// Run (after every declaration above, so the scene list exists).
try {
  if (mode === '--graphic') await featureGraphic();
  else if (mode === '--screens') {
    await captureScreens();
    await frameScreens();
  } else if (mode === '--frame') await frameScreens();
  else throw new Error(`Unknown option ${mode} (use --graphic, --screens or --frame)`);
} finally {
  await browser.close();
}
