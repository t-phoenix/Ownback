import { describe, expect, it } from 'vitest';
import { usMarketState } from '../src/lib/markets/market-hours.js';
import { bucketTicks, withLivePrice } from '../src/lib/markets/candles.js';
import { pctToBps } from '../src/lib/jupiter-price.js';
import { pickAmount } from '../src/routes/sells.js';
import { sortMarkets } from '../src/routes/markets.js';
import { ApiError } from '../src/shared/errors.js';

describe('US market hours (display only)', () => {
  it('is open mid-session on a weekday, across both DST regimes', () => {
    expect(usMarketState(new Date('2026-11-10T15:00:00Z'))).toBe('open'); // Tue 10:00 EST
    expect(usMarketState(new Date('2026-07-14T14:00:00Z'))).toBe('open'); // Tue 10:00 EDT
  });
  it('is pre, post and closed at the edges', () => {
    expect(usMarketState(new Date('2026-11-10T14:29:00Z'))).toBe('pre'); // 09:29 EST
    expect(usMarketState(new Date('2026-11-10T21:00:00Z'))).toBe('post'); // 16:00 EST
    expect(usMarketState(new Date('2026-11-11T03:00:00Z'))).toBe('closed'); // 22:00 EST
  });
  it('is closed on weekends and NYSE holidays', () => {
    expect(usMarketState(new Date('2026-11-14T16:00:00Z'))).toBe('closed'); // Saturday
    expect(usMarketState(new Date('2026-11-26T16:00:00Z'))).toBe('closed'); // Thanksgiving
    expect(usMarketState(new Date('2027-07-05T15:00:00Z'))).toBe('closed'); // July 4 observed
  });
});

describe('candles', () => {
  const m = 60_000;
  it('buckets ticks into OHLC per interval', () => {
    const c = bucketTicks([
      { at: 0, usd6: 100n }, { at: 1 * m, usd6: 120n }, { at: 2 * m, usd6: 90n },
      { at: 5 * m, usd6: 95n }, { at: 6 * m, usd6: 97n },
    ], 5 * m);
    expect(c).toEqual([
      { t: 0, o: '100', h: '120', l: '90', c: '90' },
      { t: 300, o: '95', h: '97', l: '95', c: '97' },
    ]);
  });
  it('ends the last candle at the live price, widening high/low', () => {
    const base = [{ t: 0, o: '100', h: '110', l: '95', c: '105' }];
    expect(withLivePrice(base, 120n, 5 * m, 60_000)).toEqual([{ t: 0, o: '100', h: '120', l: '95', c: '120' }]);
    expect(withLivePrice(base, 99n, 5 * m, 6 * m)).toEqual([...base, { t: 300, o: '105', h: '105', l: '99', c: '99' }]);
    expect(withLivePrice(base, null, 5 * m)).toBe(base);
  });
});

describe('pctToBps', () => {
  it('turns Jupiter percents into whole bps', () => {
    expect(pctToBps(2.042426818515728)).toBe(204);
    expect(pctToBps(-0.826)).toBe(-83);
    expect(pctToBps('1.5')).toBe(150);
    expect(pctToBps(null)).toBeNull();
    expect(pctToBps('nope')).toBeNull();
  });
});

describe('sell sizing', () => {
  const held = 26_380_000n; // 0.2638 AAPLx at 8 decimals
  it('sells a percent of what is held', () => {
    expect(pickAmount(held, { pct: '50' }, 8)).toBe(13_190_000n);
    expect(pickAmount(held, { pct: '100' }, 8)).toBe(held);
    expect(() => pickAmount(held, { pct: '33' }, 8)).toThrow(ApiError);
  });
  it('converts dollars at the price, floored and capped at held', () => {
    // $23.14 at $231.40 per token = 0.1 token
    expect(pickAmount(held, { usd6: '23140000' }, 8, 231_400_000n)).toBe(10_000_000n);
    expect(pickAmount(held, { usd6: '999000000' }, 8, 231_400_000n)).toBe(held);
    expect(() => pickAmount(held, { usd6: '1000' }, 8, null)).toThrow(ApiError);
  });
  it('keeps the old qty behaviour', () => {
    expect(pickAmount(held, '0.1', 8)).toBe(10_000_000n);
    expect(pickAmount(held, undefined, 8)).toBe(held);
    expect(() => pickAmount(held, '1', 8)).toThrow(ApiError);
  });
});

describe('market sort', () => {
  const rows = [
    { name: 'B', changeBps: 50, liquidityUsd6: 10n, priceUsd6: 1n },
    { name: 'A', changeBps: -20, liquidityUsd6: 30n, priceUsd6: 1n },
    { name: 'C', changeBps: null, liquidityUsd6: null, priceUsd6: null },
  ];
  it('orders popular by liquidity with unpriced last', () => {
    expect(sortMarkets(rows, 'popular').map((r) => r.name)).toEqual(['A', 'B', 'C']);
  });
  it('orders gainers and losers, unknown change last', () => {
    expect(sortMarkets(rows, 'gainers').map((r) => r.name)).toEqual(['B', 'A', 'C']);
    expect(sortMarkets(rows, 'losers').map((r) => r.name)).toEqual(['A', 'B', 'C']);
  });
});
