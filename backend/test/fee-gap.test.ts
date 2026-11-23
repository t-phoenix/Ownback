import { afterEach, describe, expect, it, vi } from 'vitest';
import { ownbackFee, ownbackFeeUsd6 } from '../src/lib/fees.js';
import { gapBps } from '../src/lib/token-stats.js';

afterEach(() => vi.unstubAllEnvs());

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
  it('takes bps of the spend', () => {
    vi.stubEnv('OWNBACK_FEE_BPS', '50');
    vi.stubEnv('OWNBACK_FEE_ACCOUNT', 'Fee111');
    expect(ownbackFeeUsd6(5_000_000n)).toBe(25_000n);
  });
});

describe('gapBps', () => {
  it('reports the token premium and hides a likely ticker mismatch', () => {
    expect(gapBps(101_000_000n, 100_000_000n)).toBe(100);
    expect(gapBps(300_000_000n, 100_000_000n)).toBeNull();
    expect(gapBps(null, 100_000_000n)).toBeNull();
  });
});
