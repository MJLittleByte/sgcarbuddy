/**
 * Run the Worker under plain Node for local development.
 *
 * Runs the exact same handler (src/index.ts) without Cloudflare's local runtime, so it starts instantly.
 * Edge cache and rate limiter are simply absent here; the in-memory cache still works.
 *
 *   npm run dev:node        → http://localhost:8787  (also on your LAN IP)
 *
 * Behind a proxy it uses HTTPS_PROXY and the system's trusted certificates automatically (scripts/node-net.ts).
 */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import worker, { type Env } from '../src/index';
import { relaunchWithNetworkEnv } from './node-net';

if (!relaunchWithNetworkEnv()) start();

function start() {
  for (const f of ['.env', '.env.local']) if (existsSync(f)) process.loadEnvFile(f);
  // Timestamps, so network drop-outs ("upstream fetch failed") can be matched to what the app showed.
  for (const k of ['log', 'warn', 'error'] as const) {
    const write = console[k].bind(console);
    console[k] = (...args: unknown[]) => write(new Date().toLocaleTimeString('en-GB', { hour12: false }), ...args);
  }

  const env: Env = {
    LTA_ACCOUNT_KEY: process.env.LTA_ACCOUNT_KEY || undefined,
    DATAGOVSG_API_KEY: process.env.DATAGOVSG_API_KEY || undefined,
    ONEMAP_EMAIL: process.env.ONEMAP_EMAIL || undefined,
    ONEMAP_PASSWORD: process.env.ONEMAP_PASSWORD || undefined,
    URA_ACCESS_KEY: process.env.URA_ACCESS_KEY || undefined,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? '*',
  };
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const port = Number(process.env.PORT ?? 8787);

  createServer(async (req, res) => {
    const started = Date.now();
    const request = new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers: req.headers as HeadersInit });
    const response = await worker.fetch(request, env, ctx);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    console.log(`${req.method} ${req.url} → ${response.status} (${Date.now() - started} ms)`);
  }).listen(port, '0.0.0.0', () => {
    console.log(`SG Car Buddy API (Node dev) on http://localhost:${port}`);
    console.log(`LTA key: ${env.LTA_ACCOUNT_KEY ? 'set' : 'MISSING — add LTA_ACCOUNT_KEY to worker/.env.local'} · data.gov.sg key: ${env.DATAGOVSG_API_KEY ? 'set' : 'not set (public tier)'} · URA key: ${env.URA_ACCESS_KEY ? 'set' : 'not set (standard URA rates)'}`);
  });
  console.log(`Network: ${process.env.NODE_USE_ENV_PROXY === '1' ? 'via HTTPS_PROXY' : 'direct'}${process.execArgv.includes('--use-system-ca') ? ' · system certificates' : ''}`);
}
