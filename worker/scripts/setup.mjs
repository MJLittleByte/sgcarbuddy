#!/usr/bin/env node
/**
 * One-command Cloudflare setup / redeploy for the SG Car Buddy Worker (free plan friendly).
 *
 *   npm run deploy:prod                       (same as npm run setup)
 *   node scripts/setup.mjs --env-file=.env.x  (any other key file)
 *
 * Keys come from worker/.env.production (this app's own production keys), or worker/.env.local if there is no
 * .env.production yet (with a warning). Both are gitignored.
 *
 * 1. Checks the key file has your LTA key.
 * 2. Logs in to Cloudflare if needed (opens the browser once).
 * 3. Typechecks + tests, then deploys the Worker.
 * 4. Uploads secrets from .env.local straight to Cloudflare (via stdin; nothing written to disk).
 * 5. Smoke-tests the live API.
 * 6. Writes mobile/.env.production with the Worker URL, so `npm run build` / `android:apk` use it.
 *
 * Safe to re-run any time (e.g. after changing code or rotating a key).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

const root = new URL('..', import.meta.url);
const envArg = process.argv.find((a) => a.startsWith('--env-file='))?.slice('--env-file='.length);
const envName = envArg ?? (existsSync(new URL('.env.production', root)) ? '.env.production' : '.env.local');
const envPath = new URL(envName, root);
const mobileEnv = new URL('../mobile/.env.production', root);
const SECRETS = ['LTA_ACCOUNT_KEY', 'DATAGOVSG_API_KEY', 'ONEMAP_EMAIL', 'ONEMAP_PASSWORD', 'URA_ACCESS_KEY'];
const isWin = process.platform === 'win32';
const npx = isWin ? 'npx.cmd' : 'npx';

const c = { b: (s) => `\x1b[1m${s}\x1b[0m`, g: (s) => `\x1b[32m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m` };
const step = (n, s) => console.log(`\n${c.b(`[${n}/6]`)} ${s}`);
const fail = (s) => {
  console.error(`\n${c.r('✖')} ${s}`);
  process.exit(1);
};

function readEnv() {
  if (!existsSync(envPath)) fail(`worker/${envName} not found. Copy worker/.env.example to worker/.env.production and fill in LTA_ACCOUNT_KEY.`);
  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

/** Run a command with live output; resolve with captured stdout. */
function run(cmd, args, { input, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, stdio: [input === undefined ? 'inherit' : 'pipe', capture ? 'pipe' : 'inherit', 'inherit'] });
    let out = '';
    if (capture) child.stdout.on('data', (d) => {
      out += d;
      process.stdout.write(d);
    });
    if (input !== undefined) {
      child.stdin.write(input);
      child.stdin.end();
    }
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}`))));
  });
}

async function getJson(url, tries = 1) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { Origin: 'https://localhost' }, signal: AbortSignal.timeout(20_000) });
      const body = await res.json();
      return { status: res.status, body };
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

/* ---------------------------------------------------------------- */

console.log(c.b('SG Car Buddy · Cloudflare setup'));

step(1, `Checking worker/${envName}`);
const env = readEnv();
if (!env.LTA_ACCOUNT_KEY) fail(`LTA_ACCOUNT_KEY is empty in worker/${envName}.`);
if (envName === '.env.local') console.log(`  ${c.y('!')} Using worker/.env.local (development keys). For the Play release, put this app's own keys in worker/.env.production.`);
const secrets = Object.fromEntries(SECRETS.filter((k) => env[k]).map((k) => [k, env[k]]));
console.log(`  Secrets to upload: ${Object.keys(secrets).join(', ')}  ${c.g('✓')}`);

step(2, 'Cloudflare login');
const who = spawnSync(npx, ['wrangler', 'whoami'], { cwd: root, encoding: 'utf8' });
if (/not authenticated|not logged in/i.test(`${who.stdout}${who.stderr}`) || who.status !== 0) {
  console.log('  Not logged in yet: opening the Cloudflare login page in your browser…');
  await run(npx, ['wrangler', 'login']);
} else {
  const email = (who.stdout.match(/associated with the email ([^\s.]+@[^\s]+?)\.?\s/) ?? [])[1];
  console.log(`  Logged in${email ? ` as ${email}` : ''}  ${c.g('✓')}`);
}

step(3, 'Typecheck, tests and deploy');
await run(isWin ? 'npm.cmd' : 'npm', ['run', 'typecheck']);
await run(isWin ? 'npm.cmd' : 'npm', ['test']);
const out = await run(npx, ['wrangler', 'deploy'], { capture: true });
let url = (out.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i) ?? [])[0];
if (!url) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  url = (await rl.question('  Paste the Worker URL shown above (https://….workers.dev): ')).trim().replace(/\/+$/, '');
  rl.close();
}
console.log(`  Live at ${c.b(url)}  ${c.g('✓')}`);

step(4, `Uploading secrets (from ${envName}, via stdin)`);
await run(npx, ['wrangler', 'secret', 'bulk'], { input: JSON.stringify(secrets) });

step(5, 'Smoke test');
let health;
for (let i = 0; i < 6; i++) {
  health = await getJson(`${url}/v1/health`, 3);
  if (health.body?.ltaConfigured) break;
  await new Promise((r) => setTimeout(r, 4000)); // secrets take a few seconds to reach every location
}
if (!health.body?.ok || !health.body?.ltaConfigured) fail(`Health check failed: ${JSON.stringify(health.body)}`);
console.log(`  /v1/health        ok, LTA key configured  ${c.g('✓')}`);
const av = await getJson(`${url}/v1/carparks/availability`, 3);
console.log(`  /v1/carparks/availability  HTTP ${av.status}, ${Object.keys(av.body?.lots ?? {}).length} carparks  ${av.status === 200 ? c.g('✓') : c.r('✖')}`);
const cams = await getJson(`${url}/v1/roads/cameras`, 3);
console.log(`  /v1/roads/cameras          HTTP ${cams.status}, ${cams.body?.cameras?.length ?? 0} cameras  ${cams.status === 200 ? c.g('✓') : c.r('✖')}`);

step(6, 'Pointing the app at the live API');
writeFileSync(
  mobileEnv,
  `# Written by worker/scripts/setup.mjs. Used by production builds (npm run build / android:apk / android:aab).\n# Public URL, not a secret. Local dev keeps using mobile/.env.local.\nVITE_API_BASE_URL=${url}\n# No placeholder ads in release builds (AdMob is not added yet).\nVITE_AD_PLACEHOLDER=off\n`,
);
console.log(`  mobile/.env.production → VITE_API_BASE_URL=${url}  ${c.g('✓')}`);

console.log(`\n${c.g('Done.')} Next:
  • Release bundle for Google Play:       cd ../mobile && npm run android:aab
  • Or a test APK against the live API:   cd ../mobile && npm run android:apk
  • Watch free-plan usage (100k/day):     npm run usage
  • Redeploy after code changes:          npm run setup   (or just: npm run deploy)`);
