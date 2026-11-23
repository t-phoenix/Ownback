import { afterEach, describe, expect, it, vi } from 'vitest';
import { cheapest, venueMint, venueTag, type BuyVenue } from '../src/lib/venues.js';
import { afterOwnbackFee, ownbackFee, ownbackFeeUsd6 } from '../src/lib/fees.js';
import { gapBps } from '../src/lib/token-stats.js';

afterEach(() => vi.unstubAllEnvs());

const v = (symbol: string, fee: bigint, quoted = true) =>
  ({ mint: { symbol } as BuyVenue['mint'], quote: quoted ? ({} as BuyVenue['quote']) : null, feeUsd6: fee }) satisfies BuyVenue;

describe('D43 venues', () => {
  it('cheapest quoted venue wins; unquoted never beats a quoted one', () => {
    expect(cheapest([v('AAPLx', 30_000n), v('AAPLon', 10_000n)])?.mint.symbol).toBe('AAPLon');
    expect(cheapest([v('AAPLon', 0n, false), v('AAPLx', 90_000n)])?.mint.symbol).toBe('AAPLx');
  });
  it('venue tag round-trips the mint; legacy "jupiter" has none', () => {
    expect(venueMint(venueTag('Xs123'))).toBe('Xs123');
    expect(venueMint('jupiter')).toBeUndefined();
  });
});

describe('D44 Ownback fee', () => {
  it('is off unless both env values are set and bps is 1–100', () => {
    expect(ownbackFee()).toBeNull();
    vi.stubEnv('OWNBACK_FEE_BPS', '50');
    expect(ownbackFee()).toBeNull();
    vi.stubEnv('OWNBACK_FEE_ACCOUNT', 'Fee111');
    expect(ownbackFee()).toEqual({ bps: 50, account: 'Fee111' });
    vi.stubEnv('OWNBACK_FEE_BPS', '500');
    expect(ownbackFee()).toBeNull();
  });
  it('takes bps of the spend and shrinks tokens out by the same share', () => {
    vi.stubEnv('OWNBACK_FEE_BPS', '50');
    vi.stubEnv('OWNBACK_FEE_ACCOUNT', 'Fee111');
    expect(ownbackFeeUsd6(5_000_000n)).toBe(25_000n);
    expect(afterOwnbackFee(1_000_000n)).toBe(995_000n);
  });
});

describe('gapBps', () => {
  it('reports the token premium and hides a likely ticker mismatch', () => {
    expect(gapBps(101_000_000n, 100_000_000n)).toBe(100);
    expect(gapBps(300_000_000n, 100_000_000n)).toBeNull();
    expect(gapBps(null, 100_000_000n)).toBeNull();
  });
});
