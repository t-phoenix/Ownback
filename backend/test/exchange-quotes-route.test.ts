import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/http.js', async (orig) => ({ ...(await orig<typeof import('../src/lib/http.js')>()), requireUser: async () => ({ id: 'u1' }) }));
const { exchangeRoutes } = await import('../src/routes/exchanges.js');
const { _setPoolIndex, summarize } = await import('../src/lib/markets/pools.js');

const TSLAX = 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const pair = (dexId: string, liq: number) => ({ dexId, pairAddress: dexId, priceUsd: '390', baseToken: { address: TSLAX }, quoteToken: { address: USDC }, liquidity: { usd: liq }, volume: { h24: 1 } });
const quoteBody = (out: string) => JSON.stringify({ inAmount: '25000000', outAmount: out, otherAmountThreshold: out, priceImpactPct: '0.0001', routePlan: [] });

afterEach(() => { vi.unstubAllGlobals(); _setPoolIndex(TSLAX, null); });

describe('D47 GET /quotes/exchanges', () => {
  it('answers what is ready, marks the rest pending, then completes on the next poll without re-asking Jupiter', async () => {
    _setPoolIndex(TSLAX, summarize(TSLAX, [pair('raydium', 2_000_000), pair('orca', 90_000), pair('meteora', 50_000)]));
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('Whirlpool')) return new Response(JSON.stringify({ error: 'No routes found', errorCode: 'NO_ROUTES_FOUND' }), { status: 400 });
      if (url.includes('Meteora')) return new Response('{}', { status: 500 });
      return new Response(quoteBody(url.includes('dexes=') ? '6404665' : '6406771'), { status: 200 });
    }));
    const get = async () => (await exchangeRoutes.request(`/quotes/exchanges?assetId=co:tesla&side=buy&amountUsd6=25000000`)).json() as Promise<{ complete: boolean; options: { key: string; status: string; recommended: boolean }[] }>;
    const first = await get();
    expect(first.options[0]).toMatchObject({ key: 'best', status: 'ok', recommended: true });
    expect(first.complete).toBe(false); // keyless: exchanges are queued ~1 s apart
    let last = first;
    for (let i = 0; i < 8 && !last.complete; i++) { await new Promise((r) => setTimeout(r, 1_000)); last = await get(); }
    expect(last.complete).toBe(true);
    expect(Object.fromEntries(last.options.map((o) => [o.key, o.status]))).toEqual({ best: 'ok', raydium: 'ok', orca: 'no_route', meteora: 'error' });
    expect(calls.filter((u) => u.includes('swap/v1/quote')).length).toBe(4); // one per row; polls reuse results
  }, 15_000);
});
