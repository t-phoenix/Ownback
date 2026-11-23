import { afterEach, describe, expect, it, vi } from 'vitest';
import { _resetRouteCache, checkBuyable } from '../src/lib/match/buyable.js';
import { tokenAssetsOf, verifiedMint } from '../src/shared/assets.js';

const mintsOf = (company: string) => tokenAssetsOf(company, 'solana').map((a) => verifiedMint(a.assetId, 'solana')!);

afterEach(() => { vi.unstubAllGlobals(); _resetRouteCache(); });

const res = (status: number, body: object) => new Response(JSON.stringify(body), { status });
const PRICE = 100; // every token priced at $100 by the price API

/** Routes Jupiter quote / price calls; `lossPct(mint)` = how much a $5 quote loses vs the price (null = no answer). */
function stubJupiter(lossPct: (mint: string) => number | null, onQuote?: () => Promise<void>) {
  const decimals = new Map(['co:apple', 'co:tsmc', 'co:skhy'].flatMap((id) => mintsOf(id).map((m) => [m.mint, m.decimals] as const)));
  const fetch = vi.fn(async (url: string) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/quote')) {
      await onQuote?.();
      const mint = u.searchParams.get('outputMint')!;
      const loss = lossPct(mint);
      if (loss == null) return res(500, {});
      const raw = (BigInt(Math.round(5 / PRICE * (1 - loss / 100) * 1e6)) * 10n ** BigInt(decimals.get(mint) ?? 8)) / 1_000_000n;
      return res(200, { outAmount: raw.toString(), inAmount: '5000000' });
    }
    if (u.pathname.includes('/price/')) {
      return res(200, Object.fromEntries((u.searchParams.get('ids') ?? '').split(',').map((m) => [m, { usdPrice: PRICE }])));
    }
    return res(404, {}); // token stats / reference prices: display only, hidden on failure
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('checkBuyable (D43/D45: jar-sized quote within the fee cap, every token asset of the company)', () => {
  it('quotes one at a time, so a 9-row read does not trip the 429 limit', async () => {
    let live = 0, peak = 0;
    stubJupiter(() => 0.3, async () => { peak = Math.max(peak, ++live); await new Promise((r) => setTimeout(r, 5)); live--; });
    const out = await Promise.all(['co:tsmc', 'co:skhy'].map(checkBuyable));
    expect(out.every((b) => b.buyable)).toBe(true);
    expect(peak).toBe(1);
  });

  it('a route that loses more than the 5% cap is not tradable', async () => {
    stubJupiter(() => 72);
    const b = await checkBuyable('co:tsmc');
    expect(b.buyable).toBe(false);
    expect(b.venues?.[0]?.feeBps).toBeGreaterThan(500);
  });

  it('picks the cheaper venue when an asset has two tokens', async () => {
    const [x, on] = mintsOf('co:apple');
    expect(on).toBeDefined();
    stubJupiter((m) => (m === x!.mint ? 40 : 0.2));
    const b = await checkBuyable('co:apple');
    expect(b.buyable).toBe(true);
    expect(b.symbol).toBe(on!.symbol);
    expect(b.assetId).toBe('tok:aaplon'); // each token is its own asset (D45)
    expect(b.venues?.map((v) => [v.assetId, v.tradable])).toEqual([['tok:aaplon', true], ['co:apple', false]]);
  });

  it('does not cache an unanswered quote', async () => {
    let answer = false;
    stubJupiter(() => (answer ? 0.2 : null));
    expect((await checkBuyable('co:skhy')).buyable).toBe(false);
    answer = true;
    expect((await checkBuyable('co:skhy')).buyable).toBe(true);
  });
});

describe('D45 one token per asset', () => {
  it('every curated asset has exactly one token, and extra tokens point back to their company', async () => {
    const { listBuyableAssets, companyOf } = await import('../src/shared/assets.js');
    const all = listBuyableAssets();
    expect(all.every((a) => a.mints.length === 1)).toBe(true);
    expect(companyOf('tok:aaplon')).toBe('co:apple');
    expect(companyOf('co:apple')).toBe('co:apple');
    expect(mintsOf('co:apple').map((m) => m.symbol)).toEqual(['AAPLx', 'AAPLon']);
  });
});
