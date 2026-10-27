#!/usr/bin/env node
/**
 * Pre-flight for `npm run android:aab`: stops a release bundle that would ship demo data,
 * point at a local server, or be unsigned.
 */
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const problems = [];
const ok = (s) => console.log(`  ✓ ${s}`);

// 1. API URL for release builds (written by `cd worker && npm run deploy:prod`).
const envProd = new URL('.env.production', root);
const url = existsSync(envProd) ? (readFileSync(envProd, 'utf8').match(/^\s*VITE_API_BASE_URL\s*=\s*(\S+)/m) ?? [])[1] : undefined;
if (!url) problems.push('mobile/.env.production has no VITE_API_BASE_URL. Deploy the Worker first: cd worker && npm run deploy:prod');
else if (!/^https:\/\//.test(url)) problems.push(`VITE_API_BASE_URL must be https (got ${url}).`);
else {
  // Catch typos / undeployed Workers before they are baked into a Play upload.
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/v1/health`, { headers: { Origin: 'https://localhost' }, signal: AbortSignal.timeout(15_000) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) problems.push(`API ${url}/v1/health returned HTTP ${res.status}. Check the URL or redeploy: cd worker && npm run deploy:prod`);
    else if (!body.ltaConfigured) problems.push(`API ${url} is up but LTA_ACCOUNT_KEY is not set on Cloudflare. Run: cd worker && npm run deploy:prod`);
    else if (res.headers.get('access-control-allow-origin') !== 'https://localhost')
      problems.push(`API ${url} does not allow the app origin https://localhost (CORS). Check ALLOWED_ORIGINS in worker/wrangler.jsonc`);
    else ok(`API: ${url} (live, LTA key set, CORS ok)`);
  } catch (e) {
    const code = e.cause?.code ?? e.message;
    // Host doesn't exist = wrong URL (typo in the subdomain): never ship that.
    if (code === 'ENOTFOUND') problems.push(`API host not found: ${url}. Check the subdomain (Workers & Pages → your Worker → Domains & Routes) or re-run: cd worker && npm run deploy:prod`);
    // Offline: don't block the build, but say so.
    else console.warn(`  ! API: ${url} (could not reach /v1/health from this machine: ${code}). Verify it on your phone.`);
  }
}

// 1b. No placeholder ads in a store build.
if (existsSync(envProd) && /^\s*VITE_AD_PLACEHOLDER\s*=\s*on\b/m.test(readFileSync(envProd, 'utf8'))) problems.push('mobile/.env.production has VITE_AD_PLACEHOLDER=on (mock ads). Set it to off.');

// 2. Signing.
const propsUrl = new URL('android/keystore.properties', root);
if (!existsSync(propsUrl)) problems.push('mobile/android/keystore.properties is missing. Create the upload key: npm run android:keystore');
else {
  const props = Object.fromEntries(
    readFileSync(propsUrl, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
  const missing = ['storeFile', 'storePassword', 'keyAlias', 'keyPassword'].filter((k) => !props[k]);
  if (missing.length) problems.push(`keystore.properties is missing: ${missing.join(', ')}`);
  else if (!existsSync(props.storeFile)) problems.push(`Keystore file not found: ${props.storeFile}`);
  else ok(`Signing: ${props.storeFile} (alias ${props.keyAlias})`);
}

// 3. Version.
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
if (!Number.isInteger(pkg.androidVersionCode) || pkg.androidVersionCode < 1) problems.push('package.json androidVersionCode must be a positive integer.');
else ok(`Version: ${pkg.version} (versionCode ${pkg.androidVersionCode}). Bump androidVersionCode for every upload to Play.`);

if (problems.length) {
  console.error('\n✖ Not ready for a release build:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log('  Ready.\n');
