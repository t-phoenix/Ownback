import { describe, expect, it } from 'vitest';
import { formatUsd, investAmount, parseUsd6, toUsd6 } from '../src/shared/money.js';
import { splitInvest, scaleAllocations } from '../src/lib/split.js';
import { feeWithinCap, maxFeeUsd6, feePctBps } from '../src/lib/fees.js';
import { jarState, precheckConfirm, remainingThisMonth } from '../src/lib/limits.js';
import { ApiError, mapVaultError } from '../src/shared/errors.js';

describe('money', () => {
  it('parses Usd6 and formats without floats', () => {
    expect(parseUsd6('47750000')).toBe(47_750_000n);
    expect(formatUsd('47750000')).toBe('$47.75');
    expect(toUsd6(1_000_000n)).toBe('1000000');
  });

  it('computes invest amount half-up to whole cents', () => {
    expect(investAmount(955_000_000n, 500)).toBe(47_750_000n); // $47.75
    expect(investAmount(2_630_000n, 500)).toBe(130_000n); // $0.13
    expect(investAmount(60_220_000n, 500)).toBe(3_010_000n); // $3.01
  });
});

describe('split D18', () => {
  it('matches Confirm fixture $47.75 → Apple/TSMC/QCOM/Corning/gold/silver', () => {
    const { investUsd6, rows } = splitInvest({
      amountUsd6: 955_000_000n,
      rateBps: 500,
      split: { maker: 70, behind: 20, materials: 10 },
      makers: [{ assetId: 'co:apple', role: 'maker' }],
      behind: [
        { assetId: 'co:tsmc', role: 'supplier' },
        { assetId: 'co:qualcomm', role: 'supplier' },
        { assetId: 'co:corning', role: 'supplier' },
      ],
      materials: [
        { assetId: 'mat:gold', role: 'material' },
        { assetId: 'mat:silver', role: 'material' },
      ],
      fallbackAsset: 'idx:sp500',
    });
    expect(investUsd6).toBe(47_750_000n);
    const byId = Object.fromEntries(rows.map((r) => [r.assetId, r.amountUsd6]));
    expect(byId['co:apple']).toBe(33_430_000n);
    expect(byId['co:tsmc']).toBe(3_180_000n);
    expect(byId['co:qualcomm']).toBe(3_180_000n);
    expect(byId['co:corning']).toBe(3_190_000n);
    expect(byId['mat:gold']).toBe(2_390_000n);
    expect(byId['mat:silver']).toBe(2_380_000n);
    expect(rows.reduce((a, r) => a + r.amountUsd6, 0n)).toBe(47_750_000n);
  });

  it('scales partial confirm with largest remainder', () => {
    const scaled = scaleAllocations(
      [
        { assetId: 'co:apple', amountUsd6: 33_430_000n },
        { assetId: 'co:tsmc', amountUsd6: 3_180_000n },
      ],
      5_000_000n,
    );
    expect(scaled.reduce((a, r) => a + r.amountUsd6, 0n)).toBe(5_000_000n);
  });
});

describe('fees Q2', () => {
  it('passes and blocks with integer bps check', () => {
    expect(feeWithinCap(50_000n, 5_000_000n, 500)).toBe(true); // 1%
    expect(feeWithinCap(300_000n, 3_180_000n, 500)).toBe(false); // ~9.4%
    expect(feePctBps(50_000n, 43_630_000n)).toBe(11); // 0.11% → 11 bps
    expect(maxFeeUsd6(47_750_000n, 500)).toBe(2_387_500n);
  });
});

describe('limits + ready min', () => {
  it('LIMIT_REACHED when over monthly cap', () => {
    expect(() =>
      precheckConfirm({
        investUsd6: 47_750_000n,
        usedUsd6: 45_000_000n,
        capUsd6: 50_000_000n,
        freeUsd6: 100_000_000n,
      }),
    ).toThrow(ApiError);
    try {
      precheckConfirm({
        investUsd6: 47_750_000n,
        usedUsd6: 45_000_000n,
        capUsd6: 50_000_000n,
        freeUsd6: 100_000_000n,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe('LIMIT_REACHED');
      expect((e as ApiError).details?.leftUsd6).toBe('5000000');
    }
  });

  it('jar ready threshold is not a max', () => {
    expect(jarState(4_999_999n, 5_000_000n)).toBe('filling');
    expect(jarState(5_000_000n, 5_000_000n)).toBe('ready');
    expect(jarState(33_430_000n, 5_000_000n)).toBe('ready');
  });

  it('remainingThisMonth', () => {
    expect(remainingThisMonth(45_000_000n, 50_000_000n).leftUsd6).toBe(5_000_000n);
  });
});

describe('vault error map', () => {
  it('maps without OverAssetCap', () => {
    expect(mapVaultError('OverMonthlyCap')).toBe('LIMIT_REACHED');
    expect(mapVaultError('InsufficientFree')).toBe('INSUFFICIENT_FREE');
    expect(mapVaultError('IsPaused')).toBe('KEEPER_DISABLED');
    expect(mapVaultError('AnythingElse')).toBe('TX_REVERTED');
  });
});
