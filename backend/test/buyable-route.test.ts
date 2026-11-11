import { afterEach, describe, expect, it, vi } from 'vitest';
import { _resetRouteCache, checkBuyable } from '../src/lib/match/buyable.js';

afterEach(() => { vi.unstubAllGlobals(); _resetRouteCache(); });

const res = (status: number, body: object) => new Response(JSON.stringify(body), { status });

describe('checkBuyable route probe', () => {
  it('probes one at a time, so a 9-row read does not trip the 429 limit', async () => {
    let live = 0, peak = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      peak = Math.max(peak, ++live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return res(200, { outAmount: '1', inAmount: '1' });
    }));
    const out = await Promise.all(['co:tsmc', 'co:skhy', 'co:apple'].map(checkBuyable));
    expect(out.every((b) => b.buyable)).toBe(true);
    expect(peak).toBe(1);
  });

  it('does not cache a failed request as "no route"; caches a real NO_ROUTES_FOUND', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(res(500, {})).mockResolvedValueOnce(res(500, {})) // first check: both tries fail
      .mockResolvedValueOnce(res(200, { outAmount: '5', inAmount: '1' })); // next check asks again
    vi.stubGlobal('fetch', fetch);
    expect((await checkBuyable('co:tsmc')).buyable).toBe(false);
    expect((await checkBuyable('co:tsmc')).buyable).toBe(true);

    vi.stubGlobal('fetch', vi.fn(async () => res(400, { errorCode: 'NO_ROUTES_FOUND' })));
    expect((await checkBuyable('co:qualcomm')).buyable).toBe(false);
    expect((await checkBuyable('co:qualcomm')).buyable).toBe(false);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
  });
});
