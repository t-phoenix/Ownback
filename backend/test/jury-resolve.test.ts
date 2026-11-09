import { describe, expect, it } from 'vitest';
import { findCommodity, findCompany, normName, normTicker, resolveRow } from '../src/lib/match/resolve.js';
import type { Buyable } from '../src/lib/match/buyable.js';

// Injected route check: only Apple has a verified mint + route here (no network in tests).
const check = async (assetId: string): Promise<Buyable> =>
  assetId === 'co:apple' ? { assetId, buyable: true, mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', decimals: 8, symbol: 'AAPLx' } : { assetId, buyable: false };

describe('resolver: names and tickers → catalog', () => {
  it('normalises names and tickers', () => {
    expect(normName('Taiwan Semiconductor Manufacturing Co., Ltd.')).toBe('taiwan semiconductor manufacturing');
    expect(normTicker('NASDAQ: TSM')).toBe('TSM');
    expect(normTicker('2330.TW')).toBe('2330');
  });
  it('matches exact names, legal suffixes, tickers and acronyms', () => {
    expect(findCompany('Apple')?.assetId).toBe('co:apple');
    expect(findCompany('Apple Inc.')?.assetId).toBe('co:apple');
    expect(findCompany('Taiwan Semiconductor', 'TSM')?.assetId).toBe('co:tsmc');
    expect(findCompany('Taiwan Semiconductor Manufacturing Company')?.assetId).toBe('co:tsmc');
    expect(findCompany('Corning Incorporated', 'GLW')?.assetId).toBe('co:corning');
    expect(findCompany('Unilever PLC', 'UL')?.assetId).toBe('co:unilever');
    expect(findCompany('Unilever')?.assetId).toBe('co:ulvr'); // name only → the tokenized listing
  });
  it('word-prefix matches only without an unknown ticker', () => {
    expect(findCompany('Amazon Web Services')?.assetId).toBe('co:amazon');
    expect(findCompany('Apple Hospitality REIT', 'APLE')?.assetId).not.toBe('co:apple');
  });
  it('maps commodities to catalog commodities or their tracking fund', () => {
    expect(findCommodity('Gold')?.assetId).toBe('mat:gold');
    expect(findCommodity('Crude oil')?.assetId).toBe('mat:oil');
    expect(findCommodity('Natural gas')?.assetId).toBe('mat:natgas');
    expect(findCommodity('Palm oil')).toBeUndefined();
    expect(findCommodity('Lithium')?.assetId).toBe('co:lit');
    expect(findCommodity('Copper')?.assetId).toMatch(/^co:(cper|copx)$/);
    expect(findCommodity('Coconut oil')).toBeUndefined();
    expect(findCommodity('Cobalt')).toBeUndefined();
  });
});

describe('resolver: status per row', () => {
  const row = (name: string, ticker?: string) => ({ name, ticker, why: 'w', agree: 3 });
  it('buyable only with a verified mint + live route', async () => {
    const r = await resolveRow('company', row('Apple Inc.', 'AAPL'), 3, check);
    expect(r).toMatchObject({ name: 'Apple', status: 'buyable', symbol: 'AAPLx', assetId: 'co:apple', agree: 3, of: 3 });
  });
  it('catalog token without verification → tokenized_unverified, no symbol', async () => {
    const r = await resolveRow('company', row('Amazon', 'AMZN'), 3, check);
    expect(r.status).toBe('tokenized_unverified');
    expect(r.symbol).toBeUndefined();
  });
  it('listed but untokenized → not_onchain; unknown with ticker → not_onchain; no ticker → private', async () => {
    expect((await resolveRow('company', row('Unilever', 'UL'), 3, check)).status).toBe('not_onchain');
    expect((await resolveRow('company', row('Hon Hai Precision (Foxconn)', '2317.TW'), 3, check)).status).toBe('not_onchain');
    expect((await resolveRow('company', row('Render Services'), 3, check)).status).toBe('private');
  });
  it('a ticker that belongs to an unrelated company is ignored', () => {
    expect(findCompany('Totally Unrelated Widgets', 'AAPL')).toBeUndefined();
    expect(findCompany('Apple', 'AAPL')?.assetId).toBe('co:apple');
    expect(findCompany('Advanced Micro Devices', 'AMD')?.assetId).toBe('co:amd');
  });
  it('never shows a ticker the catalog cannot confirm', async () => {
    const r = await resolveRow('company', row('Cargill', 'CGG'), 3, check);
    expect(r.ticker).toBeUndefined();
    expect(r.status).toBe('not_onchain');
  });
  it('commodities never come back private', async () => {
    expect((await resolveRow('commodity', row('Cobalt'), 3, check)).status).toBe('not_onchain');
    expect((await resolveRow('commodity', row('Lithium'), 3, check))).toMatchObject({ assetId: 'co:lit', name: 'Lithium' });
    expect((await resolveRow('commodity', row('Gold'), 3, check))).toMatchObject({ assetId: 'mat:gold', status: 'tokenized_unverified' });
  });
});
