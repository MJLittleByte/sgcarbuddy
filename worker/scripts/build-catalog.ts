/**
 * Bundle a carpark catalogue snapshot into the app (mobile/src/data/carparks.json), so the map works on
 * first launch, offline and in demo mode. The app replaces it with the Worker's daily catalogue when online.
 *
 *   npm run catalog        (uses worker/.env.local; LTA key needed for URA/LTA carparks and live flags)
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import worker, { type Env } from '../src/index';
import type { CarparkCatalogResponse } from '../../shared/contract';
import { relaunchWithNetworkEnv } from './node-net';

if (relaunchWithNetworkEnv()) await new Promise(() => {});

for (const f of ['.env', '.env.local']) if (existsSync(f)) process.loadEnvFile(f);

const env: Env = {
  LTA_ACCOUNT_KEY: process.env.LTA_ACCOUNT_KEY || undefined,
  DATAGOVSG_API_KEY: process.env.DATAGOVSG_API_KEY || undefined,
  URA_ACCESS_KEY: process.env.URA_ACCESS_KEY || undefined,
};
const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;

const res = await worker.fetch(new Request('http://local/v1/carparks/catalog'), env, ctx);
if (!res.ok) {
  console.error('Catalogue build failed:', res.status, await res.text());
  process.exit(1);
}
const body = (await res.json()) as CarparkCatalogResponse;
const out = join(import.meta.dirname, '../../mobile/src/data/carparks.json');
writeFileSync(out, JSON.stringify({ version: body.version, builtAt: body.fetchedAt, sources: body.sources, carparks: body.carparks }));
console.log(`Wrote ${body.carparks.length} carparks (version ${body.version}, sources ${JSON.stringify(body.sources)}) → mobile/src/data/carparks.json`);
