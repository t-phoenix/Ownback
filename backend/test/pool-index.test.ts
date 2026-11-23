import { describe, expect, it } from 'vitest';
import { _setPoolIndex, dexesFor, summarize } from '../src/lib/markets/pools.js';

const MINT = 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL = 'So11111111111111111111111111111111111111112';
const pair = (dexId: string, base: string, quote: string, liq: number, vol: number, price?: string) =>
  ({ dexId, pairAddress: `${dexId}${liq}`, priceUsd: price, baseToken: { address: base }, quoteToken: { address: quote }, liquidity: { usd: liq }, volume: { h24: vol } });

describe('D47 pool index', () => {
  const idx = summarize(MINT, [
    pair('raydium', MINT, USDC, 2_291_009, 3_581_541, '390.67'),
    pair('raydium', MINT, USDC, 342_411, 139_205, '390.08'),
    pair('raydium', MINT, SOL, 75_866, 242_338, '388.58'),
    pair('orca', MINT, USDC, 77_563, 809_579, '390.99'),
    pair('meteora', MINT, USDC, 7_204, 91_265, '390.93'),
    pair('pumpswap', 'MemeMint', MINT, 24_837, 18_755, '0.0001'), // meme pair: not USDC/SOL
    pair('raydium', MINT, USDC, 24, 0, '387.76'), // dust
    pair('newdex', MINT, USDC, 50_000, 1_000, '391.00'), // unknown exchange: counted, never quoted
  ]);

  it('sums only real pools (USDC/USDT/SOL, ≥ $1k) across exchanges', () => {
    expect(idx.liquidityUsd6).toBe(2_844_053_000_000n);
    expect(idx.volume24hUsd6).toBe(4_864_928_000_000n);
    expect(idx.thin).toBe(false);
  });

  it('groups by exchange, deepest first, price from the deepest pool', () => {
    expect(idx.exchanges.map((e) => [e.key, e.pools])).toEqual([['raydium', 3], ['orca', 1], ['newdex', 1], ['meteora', 1]]);
    expect(idx.exchanges[0]!.priceUsd6).toBe(390_670_000n);
    expect(idx.exchanges[0]!.label).toBe('Raydium');
  });

  it('offers a quote only on mapped exchanges with ≥ $10k', () => {
    const q = Object.fromEntries(idx.exchanges.map((e) => [e.key, e.quotable]));
    expect(q).toEqual({ raydium: true, orca: true, newdex: false, meteora: false });
    _setPoolIndex(MINT, idx);
    expect(dexesFor(MINT, 'raydium')).toBe('Raydium,Raydium CLMM,Raydium CP');
    expect(dexesFor(MINT, 'meteora')).toBeNull();
    expect(dexesFor(MINT, 'nope')).toBeNull();
    _setPoolIndex(MINT, null);
    expect(dexesFor(MINT, 'raydium')).toBeNull();
  });

  it('marks a token with no real pools as thin', () => {
    const empty = summarize(MINT, [pair('meteora', MINT, USDC, 900, 5, '313')]);
    expect(empty).toMatchObject({ liquidityUsd6: 0n, exchanges: [], thin: true });
  });
});
