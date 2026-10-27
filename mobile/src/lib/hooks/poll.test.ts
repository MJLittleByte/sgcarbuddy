import { describe, expect, it } from 'vitest';
import { nextPollIn } from './poll';

describe('polling back-off', () => {
  it('polls on the interval while all is well', () => {
    expect(nextPollIn(60_000, 0)).toBe(60_000);
  });
  it('retries a failed refresh within seconds, then backs off to at most 4× the interval', () => {
    expect([1, 2, 3, 4, 5, 6].map((f) => nextPollIn(60_000, f) / 1000)).toEqual([15, 30, 60, 120, 240, 240]);
    expect(nextPollIn(300_000, 1)).toBe(15_000);
    expect(nextPollIn(20_000, 1)).toBe(5_000);
  });
});
