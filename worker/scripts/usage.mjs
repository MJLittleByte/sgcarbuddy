#!/usr/bin/env node
/**
 * Today's Worker requests vs the Workers Free plan limit (100,000/day, resets 00:00 UTC = 08:00 SGT),
 * plus the last 7 days. Needs in worker/.env.local:
 *   CF_ACCOUNT_ID=…   (dashboard → Workers & Pages → right sidebar, or `npx wrangler whoami`)
 *   CF_ANALYTICS_TOKEN=…    (dashboard → My Profile → API Tokens → Create token → "Read analytics and logs" template)
 * Exits with code 2 when today is above 70%, so it can drive an alert (cron / CI).
 */
import { existsSync, readFileSync } from 'node:fs';

const FREE_PER_DAY = 100_000;
const WARN = 0.7;
const env = {};
const envPath = new URL('../.env.local', import.meta.url);
if (existsSync(envPath))
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
const account = process.env.CF_ACCOUNT_ID ?? env.CF_ACCOUNT_ID;
const token = process.env.CF_ANALYTICS_TOKEN ?? env.CF_ANALYTICS_TOKEN;
const script = 'sgcarbuddy-api';
if (!account || !token) {
  console.error('Add CF_ACCOUNT_ID and CF_ANALYTICS_TOKEN to worker/.env.local (see the comment at the top of scripts/usage.mjs).');
  process.exit(1);
}

const query = `query($a: string, $s: string, $e: string, $n: string) { viewer { accounts(filter: {accountTag: $a}) {
  workersInvocationsAdaptive(limit: 10000, filter: {scriptName: $n, datetime_geq: $s, datetime_leq: $e}) { sum { requests errors subrequests } } } } }`;

async function requests(start, end) {
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { a: account, s: start.toISOString(), e: end.toISOString(), n: script } }),
  });
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
  const rows = body.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? [];
  return rows.reduce((t, r) => ({ requests: t.requests + r.sum.requests, errors: t.errors + r.sum.errors, subrequests: t.subrequests + r.sum.subrequests }), {
    requests: 0,
    errors: 0,
    subrequests: 0,
  });
}

const now = new Date();
const dayStart = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const today = dayStart(now);
const bar = (n) => '█'.repeat(Math.min(40, Math.round((n / FREE_PER_DAY) * 40))).padEnd(40, '·');

console.log(`Worker "${script}" · free plan ${FREE_PER_DAY.toLocaleString()} requests/day (resets 08:00 SGT)\n`);
const days = [];
for (let i = 6; i >= 0; i--) {
  const s = new Date(today.getTime() - i * 86400_000);
  const e = i === 0 ? now : new Date(s.getTime() + 86400_000 - 1);
  days.push({ s, ...(await requests(s, e)) });
}
for (const d of days) {
  const pct = d.requests / FREE_PER_DAY;
  console.log(`${d.s.toISOString().slice(0, 10)}  ${bar(d.requests)} ${String(d.requests.toLocaleString()).padStart(8)}  ${(pct * 100).toFixed(0).padStart(3)}%  errors ${d.errors}`);
}
const t = days[days.length - 1];
const hours = (now.getTime() - today.getTime()) / 3600_000;
const projected = hours > 1 ? Math.round((t.requests / hours) * 24) : t.requests;
console.log(`\nToday so far: ${t.requests.toLocaleString()} (${((t.requests / FREE_PER_DAY) * 100).toFixed(1)}%) · on pace for ~${projected.toLocaleString()} by 08:00 SGT`);
if (t.requests / FREE_PER_DAY >= WARN || projected / FREE_PER_DAY >= 0.9) {
  console.log('\n⚠  Close to the free limit. Upgrade to Workers Paid ($5/month): dashboard → Workers & Pages → Plans.');
  process.exit(2);
}
