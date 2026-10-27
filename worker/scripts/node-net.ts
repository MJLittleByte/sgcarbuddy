/**
 * Local Node scripts (dev server, catalogue build) on a network that needs HTTPS_PROXY.
 *
 * Node's fetch() ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1, and some proxies present certificates that only the
 * operating system trusts (--use-system-ca). Both settings only work when set at start-up, so this restarts the
 * script once with them. No effect on Cloudflare (production).
 *
 * Returns true when the script was re-launched (the caller should stop).
 */
import { spawn } from 'node:child_process';

export function relaunchWithNetworkEnv(): boolean {
  if (process.env.SCB_NET_CHILD) return false;
  const proxy = Boolean(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy);
  const systemCa = process.allowedNodeEnvironmentFlags.has('--use-system-ca') && !process.execArgv.includes('--use-system-ca');
  const useProxy = proxy && process.env.NODE_USE_ENV_PROXY !== '1';
  if (!systemCa && !useProxy) return false;
  const child = spawn(process.execPath, [...(systemCa ? ['--use-system-ca'] : []), ...process.execArgv, ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, SCB_NET_CHILD: '1', ...(proxy ? { NODE_USE_ENV_PROXY: '1' } : {}) },
  });
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => child.kill(sig));
  child.on('exit', (code) => process.exit(code ?? 0));
  return true;
}
