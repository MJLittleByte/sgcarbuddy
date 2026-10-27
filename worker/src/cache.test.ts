import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';

/**
 * The cache must never make the app wait on a slow or unreachable source when it already has good data,
 * and must recover by itself (no restart) once the source is back.
 */
const env: Env = { LTA_ACCOUNT_KEY: 'test', ALLOWED_ORIGINS: '*' };
const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
/** DataMall page: one carpark on the first page, nothing after (pages are fetched in parallel). */
const page = (free: number, url: unknown) =>
  new Response(JSON.stringify({ value: /\$skip=0$/.test(String(url)) ? [{ CarParkID: 'SH2', Agency: 'HDB', LotType: 'C', AvailableLots: free }] : [] }));

async function availability() {
  const res = await worker.fetch(new Request('http://localhost/v1/carparks/availability'), env, ctx);
  return { status: res.status, body: (await res.json()) as { lots: Record<string, [number, number]>; fetchedAt: string; stale: boolean } };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('cache: last-good copy while the source is slow or down', () => {
  it('answers with the last good copy within the soft deadline, then picks up the background refresh', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const fetchMock = vi.fn(async (url: unknown) => page(92, url));
    vi.stubGlobal('fetch', fetchMock);

    const first = await availability();
    expect(first.body).toMatchObject({ stale: false, lots: { 'HDB:SH2': [92, -1] } });

    // Past the 60 s fresh TTL, and the source now hangs.
    await vi.advanceTimersByTimeAsync(61_000);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    fetchMock.mockImplementation(async (url: unknown) => {
      await gate;
      return page(80, url);
    });
    const pending = availability();
    await vi.advanceTimersByTimeAsync(2_600);
    const second = await pending;
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ stale: true, fetchedAt: first.body.fetchedAt, lots: { 'HDB:SH2': [92, -1] } });

    // The source answers late: the refresh lands in the cache without a restart.
    release();
    await vi.advanceTimersByTimeAsync(10);
    const third = await availability();
    expect(third.body).toMatchObject({ stale: false, lots: { 'HDB:SH2': [80, -1] } });
    expect(third.body.fetchedAt > first.body.fetchedAt).toBe(true);
  });

  it('serves the last good copy when the source fails, and recovers when it is back', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    // Well past the fresh TTL of the copy cached by the previous test (still within the 1 h last-good TTL).
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    const fetchMock = vi.fn(async (_url: unknown): Promise<Response> => {
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const pending = availability();
    await vi.advanceTimersByTimeAsync(3_000);
    const down = await pending;
    expect(down.status).toBe(200);
    expect(down.body.stale).toBe(true);
    // One quick retry per page for a dropped connection.
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);

    fetchMock.mockImplementation(async (url: unknown) => page(55, url));
    const up = await availability();
    expect(up.body).toMatchObject({ stale: false, lots: { 'HDB:SH2': [55, -1] } });
  });

  it('never has more than 4 upstream requests in flight (Cloudflare connection limit; some networks choke on more)', async () => {
    let active = 0;
    let peak = 0;
    const fetchMock = vi.fn(async (_url: unknown) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 15));
      active--;
      return new Response(JSON.stringify({ value: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Roads (4 LTA calls) and weather (4 NEA calls) together: 8 requests.
    await Promise.all(['/v1/roads', '/v1/weather'].map((p) => worker.fetch(new Request(`http://localhost${p}`), env, ctx)));
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(8);
    expect(peak).toBe(4);
  });
});
