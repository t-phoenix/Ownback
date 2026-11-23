import { afterEach, describe, expect, it, vi } from 'vitest';
import { jupiterQuoteTry } from '../src/lib/jupiter-price.js';

const opts = { inputMint: 'A', outputMint: 'B', amountRaw: 1_000_000n, retries: 0 };
const reply = (status: number, body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
afterEach(() => vi.unstubAllGlobals());

describe('D47 why a quote is missing', () => {
  it('no route is a real answer; rate limits and failures are worth asking again', async () => {
    reply(400, { error: 'No routes found', errorCode: 'NO_ROUTES_FOUND' });
    expect(await jupiterQuoteTry(opts)).toEqual({ q: null, miss: 'no_route' });
    reply(429, {});
    expect(await jupiterQuoteTry(opts)).toEqual({ q: null, miss: 'rate_limited' });
    reply(500, { error: 'boom' });
    expect(await jupiterQuoteTry(opts)).toEqual({ q: null, miss: 'upstream' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout'); }));
    expect(await jupiterQuoteTry(opts)).toEqual({ q: null, miss: 'upstream' });
  });

  it('a quote comes back as before', async () => {
    reply(200, { inAmount: '1000000', outAmount: '2850', otherAmountThreshold: '2820', priceImpactPct: '0.0002', routePlan: [] });
    const r = await jupiterQuoteTry(opts);
    expect(r.miss).toBeUndefined();
    expect(r.q).toMatchObject({ outAmount: '2850', otherAmountThreshold: '2820' });
  });
});
