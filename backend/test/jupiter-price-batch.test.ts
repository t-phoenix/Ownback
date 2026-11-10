import { afterEach, describe, expect, it, vi } from 'vitest';
import { jupiterPriceUsd6, jupiterPricesUsd6 } from '../src/lib/jupiter-price.js';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const stubPrices = (prices: Record<string, number>) => {
  const fetch = vi.fn(async (url: string) => {
    const ids = new URL(url).searchParams.get('ids')!.split(',');
    return new Response(JSON.stringify(Object.fromEntries(ids.filter((i) => i in prices).map((i) => [i, { usdPrice: prices[i] }]))));
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
};

describe('jupiter price batching', () => {
  it('sends same-tick lookups as one request, and returns null for unknown mints', async () => {
    const fetch = stubPrices({ A1: 236.41, B1: 12.5 });
    const [a, b, c] = await Promise.all([jupiterPriceUsd6('A1'), jupiterPriceUsd6('B1'), jupiterPriceUsd6('C1')]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect([a, b, c]).toEqual([236_410_000n, 12_500_000n, null]);
  });

  it('serves fresh cache without a request, and stale cache instantly on display paths', async () => {
    const fetch = stubPrices({ A2: 10 });
    await jupiterPricesUsd6(['A2']);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await jupiterPriceUsd6('A2')).toBe(10_000_000n);
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.useFakeTimers({ now: Date.now() + 60_000, toFake: ['Date'] });
    stubPrices({ A2: 11 });
    expect(await jupiterPriceUsd6('A2', { display: true })).toBe(10_000_000n); // stale, refresh in background
    await new Promise((r) => setTimeout(r, 0));
    expect(await jupiterPriceUsd6('A2')).toBe(11_000_000n); // refreshed value is now fresh
  });
});
