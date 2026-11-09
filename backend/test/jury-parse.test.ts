import { describe, expect, it } from 'vitest';
import { applyAgreement, mergeBallots, productKey } from '../src/lib/match/jury.js';
import { Ballot, extractJson, Understanding, Verdict } from '../src/lib/og/schemas.js';

const ballot = (parent: string, enablers: string[], commodities: string[]) =>
  Ballot.parse({
    parent: { name: parent, ticker: null, why: 'owns it' },
    enablers: enablers.map((n) => ({ name: n, ticker: null, role: 'x', why: `${n} helps` })),
    commodities: commodities.map((n) => ({ name: n, why: `${n} goes in` })),
  });

describe('juror JSON', () => {
  it('parses fenced replies, cuts long lists, drops fake tickers', () => {
    const text = 'Here you go:\n```json\n' + JSON.stringify({
      parent: { name: 'Apple', ticker: 'AAPL', why: 'Designs and sells the iPhone.' },
      enablers: ['TSMC', 'Foxconn', 'Qualcomm', 'Corning', 'Samsung', 'Sony', 'Broadcom'].map((n) => ({ name: n, ticker: n === 'Foxconn' ? 'N/A' : 'X', role: 'part', why: 'Makes parts.' })),
      commodities: ['Gold', 'Lithium', 'Copper', 'Cobalt'].map((n) => ({ name: n, why: 'In the phone.' })),
    }) + '\n```';
    const b = Ballot.parse(extractJson(text));
    expect(b.enablers).toHaveLength(5);
    expect(b.commodities).toHaveLength(3);
    expect(b.enablers[1]!.ticker).toBeUndefined();
    expect(b.parent.ticker).toBe('AAPL');
  });
  it('finds the answer after glm-style reasoning with {...} sketches in the prose', () => {
    const text = 'Plan: return {"parent":...} with "enablers":[...5...].\nParent: Render {private}.\n{"parent":{"name":"Render","ticker":null,"why":"Runs it."},"enablers":[],"commodities":[{"name":"Copper","why":"Wires {in} racks."}]}';
    const b = Ballot.parse(extractJson(text));
    expect(b.parent.name).toBe('Render');
    expect(b.commodities[0]!.why).toBe('Wires {in} racks.');
  });
  it('rejects a ballot without a parent', () => {
    expect(() => Ballot.parse({ enablers: [], commodities: [] })).toThrow();
  });
  it('understanding falls back instead of failing on odd enums', () => {
    const u = Understanding.parse({ productType: 'gadget', category: 'smartphone', keyComponents: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], deliveryChain: 'retail' });
    expect(u.productType).toBe('physical');
    expect(u.keyComponents).toHaveLength(6);
    expect(u.deliveryChain).toEqual([]);
  });
  it('judge verdict allows a null parent', () => {
    expect(Verdict.parse({ parent: null, enablers: [], commodities: [] }).parent).toBeNull();
  });
});

describe('merging ballots', () => {
  const ballots = [
    ballot('Apple', ['TSMC', 'Qualcomm', 'Corning', 'Foxconn', 'Samsung'], ['Gold', 'Lithium', 'Copper']),
    ballot('Apple Inc.', ['Taiwan Semiconductor Manufacturing Company', 'Foxconn', 'Corning', 'Broadcom', 'Sony'], ['Gold', 'Copper', 'Aluminium']),
    ballot('Apple', ['TSMC', 'Qualcomm', 'Apple', 'Samsung', 'Corning'], ['Lithium', 'Gold', 'Cobalt']),
  ];
  it('deterministic merge: majority parent, most-named rows first, parent never an enabler', () => {
    const m = mergeBallots(ballots);
    expect(m.parent).toMatchObject({ name: 'Apple', agree: 3 });
    expect(m.enablers.map((e) => [e.name, e.agree])).toEqual([
      ['TSMC', 3], ['Corning', 3], ['Qualcomm', 2], ['Foxconn', 2], ['Samsung', 2],
    ]);
    expect(m.commodities.map((c) => [c.name, c.agree])).toEqual([['Gold', 3], ['Lithium', 2], ['Copper', 2]]);
  });
  it('recounts the judge, drops rows no juror named, dedupes spellings', () => {
    const judged = applyAgreement(
      {
        parent: { name: 'Apple', ticker: 'AAPL', why: 'Owns iPhone', agree: 1 },
        enablers: [
          { name: 'Taiwan Semiconductor', ticker: 'TSM', why: 'Chips', agree: 9 },
          { name: 'TSMC', why: 'dup', agree: 3 },
          { name: 'Nvidia', ticker: 'NVDA', why: 'invented', agree: 2 },
          { name: 'Hon Hai Foxconn', why: 'Assembles', agree: 2 },
        ],
        commodities: [{ name: 'Gold', why: 'Wires', agree: 1 }, { name: 'Uranium', why: 'invented', agree: 1 }],
      },
      ballots,
    );
    expect(judged.parent?.agree).toBe(3);
    expect(judged.enablers.map((e) => [e.name, e.agree])).toEqual([['Taiwan Semiconductor', 3], ['Hon Hai Foxconn', 1]]);
    expect(judged.commodities.map((c) => c.name)).toEqual(['Gold']);
  });
  it('cache key ignores case, punctuation and repeated brand words', () => {
    expect(productKey({ name: 'Apple iPhone 17 Pro', brand: 'Apple' })).toBe(productKey({ name: 'iPhone 17 Pro!', brand: 'APPLE' }));
  });
});

describe('ticker borrowing', () => {
  it('fills a ticker the judge dropped from a juror who gave it', async () => {
    const { applyAgreement } = await import('../src/lib/match/jury.js');
    const ballot = { parent: { name: 'Apple', ticker: 'AAPL', why: 'w' }, enablers: [{ name: 'Advanced Micro Devices', ticker: 'AMD', why: 'w', role: '' }], commodities: [] };
    const out = applyAgreement({ parent: { name: 'Apple', why: 'w', agree: 1 }, enablers: [{ name: 'Advanced Micro Devices', why: 'w', agree: 1 }], commodities: [] }, [ballot as never]);
    expect(out.enablers[0]?.ticker).toBe('AMD');
    expect(out.parent?.ticker).toBe('AAPL');
  });
});
