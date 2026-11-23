import { describe, expect, it } from 'vitest';
import { pickVenues } from '../src/routes/jars-buys.js';
import { rankOptions } from '../src/routes/exchanges.js';
import { _setPoolIndex, dexesOfVenue, routeExchanges, summarize, venueFor, venueLabel } from '../src/lib/markets/pools.js';

const TSLAX = 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const pair = (dexId: string, liq: number) => ({ dexId, pairAddress: dexId, priceUsd: '390', baseToken: { address: TSLAX }, quoteToken: { address: USDC }, liquidity: { usd: liq }, volume: { h24: 1 } });

describe('D47 exchange choice', () => {
  it('stores and reads the venue: best = jupiter, one exchange = jupiter:<key>', () => {
    expect(venueFor(undefined)).toBe('jupiter');
    expect(venueFor('best')).toBe('jupiter');
    expect(venueFor('raydium')).toBe('jupiter:raydium');
    expect(dexesOfVenue('jupiter')).toBeUndefined();
    expect(dexesOfVenue('jupiter:orca')).toBe('Whirlpool');
    expect(dexesOfVenue('jupiter:unknown')).toBeUndefined();
    expect(venueLabel('jupiter:raydium')).toBe('Raydium');
    expect(venueLabel('jupiter')).toBeUndefined();
  });

  it('names the exchanges a quote routed through', () => {
    expect(routeExchanges([{ swapInfo: { label: 'Whirlpool' } }, { swapInfo: { label: 'Raydium CLMM' } }, { swapInfo: { label: 'Hadron' } }])).toEqual(['Orca', 'Raydium', 'Hadron']);
    expect(routeExchanges(null)).toEqual([]);
  });

  it('ranks by most out; Recommended once; diff in bps against the best', () => {
    const r = rankOptions([{ key: 'best', outRaw: '1000' }, { key: 'raydium', outRaw: '999' }, { key: 'orca', outRaw: '1000' }, { key: 'meteora', outRaw: null }]);
    expect(r.map((o) => [o.key, o.recommended, o.diffBps])).toEqual([['best', true, 0], ['raydium', false, -10], ['orca', false, 0], ['meteora', false, null]]);
  });

  it('accepts only an exchange the pool index can quote for that token; never re-routes', async () => {
    _setPoolIndex(TSLAX, summarize(TSLAX, [pair('raydium', 2_000_000), pair('meteora', 5_000)]));
    const rows = [{ assetId: 'co:tesla', jarId: 'co:tesla' }];
    expect((await pickVenues(rows, {})).get('co:tesla')).toBe('jupiter');
    expect((await pickVenues(rows, { 'co:tesla': 'best' })).get('co:tesla')).toBe('jupiter');
    expect((await pickVenues(rows, { 'co:tesla': 'raydium' })).get('co:tesla')).toBe('jupiter:raydium');
    await expect(pickVenues(rows, { 'co:tesla': 'meteora' })).rejects.toMatchObject({ code: 'VALIDATION' }); // too shallow
    await expect(pickVenues(rows, { 'co:tesla': 'orca' })).rejects.toMatchObject({ code: 'VALIDATION' }); // not listed
    _setPoolIndex(TSLAX, null);
  });
});
