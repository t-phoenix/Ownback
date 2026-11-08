import { describe, expect, it } from 'vitest';
import {
  priceUsd6FromBuyQuote,
  qtyFromSpend,
  rawToQty,
  usdStringToUsd6,
} from '../src/lib/jupiter-price.js';

describe('jupiter qty / decimals', () => {
  it('parses price strings to Usd6', () => {
    expect(usdStringToUsd6('236.41')).toBe(236_410_000n);
    expect(usdStringToUsd6('1')).toBe(1_000_000n);
  });

  it('rawToQty uses mint decimals (AAPLx = 8)', () => {
    // 0.1415 whole tokens at 8 decimals
    expect(rawToQty(14_150_000n, 8)).toBe('0.1415');
    expect(rawToQty(1_000_000_00n, 8)).toBe('1');
  });

  it('price from buy quote matches spend / whole tokens', () => {
    const spend = 33_430_000n; // $33.43
    const outRaw = 14_150_000n; // 0.1415 at 8 decimals
    const price = priceUsd6FromBuyQuote(spend, outRaw, 8);
    // ~$236.25 per token
    expect(price).toBeGreaterThan(236_000_000n);
    expect(price).toBeLessThan(237_000_000n);
  });

  it('display qtyFromSpend stays consistent with Usd6 unit price', () => {
    expect(qtyFromSpend(33_430_000n, 236_410_000n)).toBe('0.141406');
  });
});
