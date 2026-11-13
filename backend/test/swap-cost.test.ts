import { afterEach, describe, expect, it, vi } from 'vitest';
import { halfRoundTrip, rescale, sellSwapCostUsd6, sizeSellForUsd6 } from '../src/lib/jupiter-price.js';

afterEach(() => vi.unstubAllGlobals());

/** A pool that pays `usdPerToken` (Usd6 per whole 8-dp token) minus `feeBps` each way. */
function stubPool(usdPerToken: bigint, feeBps: bigint) {
  const fetch = vi.fn(async (url: string) => {
    const u = new URL(url);
    const amount = BigInt(u.searchParams.get('amount')!);
    const sellingToken = u.searchParams.get('inputMint') === 'TOKEN';
    const out = sellingToken
      ? (amount * usdPerToken) / 10n ** 8n
      : (amount * 10n ** 8n) / usdPerToken;
    const net = (out * (10_000n - feeBps)) / 10_000n;
    return new Response(JSON.stringify({ inputMint: u.searchParams.get('inputMint'), outputMint: u.searchParams.get('outputMint'), inAmount: String(amount), outAmount: String(net), otherAmountThreshold: String((net * 99n) / 100n) }));
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('measured swap cost', () => {
  it('is half the round-trip loss, never negative', () => {
    expect(halfRoundTrip(1_000_000n, 998_000n)).toBe(1_000n);
    expect(halfRoundTrip(1_000_000n, 1_000_100n)).toBe(0n);
  });

  it('values a sell round trip at the sell price', async () => {
    stubPool(355_000_000n, 25n); // $355 per token, 0.25% each way
    const amountRaw = 2_800_000n; // 0.028 token
    const out = (((amountRaw * 355_000_000n) / 10n ** 8n) * 9_975n) / 10_000n;
    const fee = await sellSwapCostUsd6('TOKEN', amountRaw, out);
    // ≈ 0.25% of the proceeds
    expect(Number(fee)).toBeGreaterThan(Number((out * 24n) / 10_000n));
    expect(Number(fee)).toBeLessThan(Number((out * 26n) / 10_000n));
  });
});

describe('sell by dollars', () => {
  it('rescales by what the pool pays, even when the reference price lags', async () => {
    stubPool(357_000_000n, 3n); // pool pays $357; reference says $355
    const r = await sizeSellForUsd6('TOKEN', 10_000_000n, 10n ** 10n, 8, 355_000_000n);
    const got = BigInt(r!.quote.outAmount);
    expect(Number(got)).toBeGreaterThan(9_995_000);
    expect(Number(got)).toBeLessThanOrEqual(10_000_000);
  });

  it('never sells more than held', async () => {
    stubPool(357_000_000n, 3n);
    const r = await sizeSellForUsd6('TOKEN', 50_000_000n, 1_000_000n, 8, 355_000_000n);
    expect(r!.amountRaw).toBe(1_000_000n);
  });

  it('rescale keeps the amount when the pool paid nothing', () => {
    expect(rescale(100n, 0n, 50n)).toBe(100n);
    expect(rescale(100n, 200n, 100n)).toBe(50n);
  });
});
