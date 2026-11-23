import { describe, expect, it } from 'vitest';
import { pickRecommended, pickTokens } from '../src/routes/jars-buys.js';
import { companyOf, jarIdsOf } from '../src/shared/assets.js';

const opt = (assetId: string, fee: string, selectable = true, liquidityUsd6?: string) => ({ assetId, selectable, fees: { totalUsd6: fee }, ...(liquidityUsd6 ? { liquidityUsd6 } : {}) });

describe('D46 token choice at buy time', () => {
  it('recommends the cheapest buyable token; liquidity breaks a tie; none when nothing is buyable', () => {
    expect(pickRecommended([opt('co:apple', '23500'), opt('tok:aaplon', '490000')])).toBe('co:apple');
    expect(pickRecommended([opt('co:apple', '900000', false), opt('tok:aaplon', '490000')])).toBe('tok:aaplon');
    expect(pickRecommended([opt('co:apple', '10000', true, '5'), opt('tok:aaplon', '10000', true, '9')])).toBe('tok:aaplon');
    expect(pickRecommended([opt('co:apple', '1', false)])).toBeUndefined();
  });

  it('uses the default token unless the buyer picked one of the offered choices', () => {
    const rows = [{ assetId: 'co:apple', amountUsd6: '5000000', token: 'co:apple', choices: ['co:apple', 'tok:aaplon'] }];
    expect(pickTokens(rows)).toEqual([{ assetId: 'co:apple', jarId: 'co:apple', amountUsd6: '5000000' }]);
    expect(pickTokens(rows, { 'co:apple': 'tok:aaplon' })[0]!.assetId).toBe('tok:aaplon');
    expect(() => pickTokens(rows, { 'co:apple': 'tok:nvdaon' })).toThrow();
    // Quotes from before D46 have no token: the jar id is the token.
    expect(pickTokens([{ assetId: 'co:apple', amountUsd6: '1' }])[0]!.assetId).toBe('co:apple');
  });

  it('a buy of any Apple token fills from the Apple jar', () => {
    expect(companyOf('tok:aaplon')).toBe('co:apple');
    expect(jarIdsOf('tok:aaplon')).toEqual(expect.arrayContaining(['co:apple', 'tok:aaplon']));
  });
});
