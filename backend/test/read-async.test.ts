/** D30 async read: the worker walks real steps and always leaves `reading` with the right status. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const calls: { text: string; values: unknown[] }[] = [];
  const sql = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ text: strings.join('?'), values });
      return Promise.resolve([]);
    },
    { json: (v: unknown) => JSON.parse(JSON.stringify(v)) }, // snapshot: StepWriter mutates its array
  );
  return { calls, sql, ogChat: vi.fn() };
});

vi.mock('../src/db/client.js', () => ({ getSql: () => h.sql }));
vi.mock('../src/lib/og/client.js', async (orig) => ({ ...(await orig<object>()), ogChat: h.ogChat }));
vi.mock('../src/lib/og/models.js', async (orig) => {
  const m = await orig<typeof import('../src/lib/og/models.js')>();
  return { ...m, healthyJuryModels: async () => m.JURY_MODELS };
});
vi.mock('../src/lib/fx.js', async (orig) => ({ ...(await orig<object>()), usdRate: async () => ({ rate: '83.5', source: 'test', date: '2026-11-09' }) }));
vi.mock('../src/lib/match/buyable.js', () => ({
  checkBuyable: async (assetId: string) => (assetId === 'co:apple' ? { assetId, buyable: true, symbol: 'AAPLx', mint: 'm', decimals: 8 } : { assetId, buyable: false }),
}));

const { readPurchase } = await import('../src/lib/og/read.js');

const rules = { rate_bps: 500, fallback_asset: 'idx:sp500', split_maker: 70, split_behind: 20, split_materials: 10 };
const reply = (o: unknown) => ({ content: JSON.stringify(o), requestId: 'req', model: 'm', provider: 'p', latencyMs: 1, raw: {} });
const ballot = {
  parent: { name: 'Apple', ticker: 'AAPL', why: 'Designs and sells the iPhone.' },
  enablers: [
    { name: 'TSMC', ticker: 'TSM', role: 'chip foundry', why: 'Makes the A-series chip.' },
    { name: 'Foxconn', ticker: '2317.TW', role: 'assembly', why: 'Assembles the phone.' },
    { name: 'Qualcomm', ticker: 'QCOM', role: 'modem', why: 'Supplies the modem.' },
    { name: 'Corning', ticker: 'GLW', role: 'glass', why: 'Makes the cover glass.' },
    { name: 'Samsung Display', ticker: null, role: 'display', why: 'Makes the OLED panel.' },
  ],
  commodities: [{ name: 'Gold', why: 'Connectors.' }, { name: 'Lithium', why: 'Battery.' }, { name: 'Copper', why: 'Wiring.' }],
};
const juryByJob = (opts: { job: string }) => {
  if (opts.job === 'understand') return reply({ productType: 'physical', category: 'smartphone', keyComponents: ['chip'], deliveryChain: ['retail'] });
  if (opts.job === 'jury') return reply(ballot);
  if (opts.job === 'judge') return reply({ ...ballot, parent: { ...ballot.parent, agree: 3 } });
  throw new Error(`unexpected job ${opts.job}`);
};

const statusWrites = () =>
  h.calls.flatMap((c) => (/SET status = \?/.test(c.text) ? [c.values[0]] : (c.text.match(/SET status = '(\w+)'/)?.slice(1) ?? [])));
const lastSteps = () => {
  const w = h.calls.filter((c) => c.text.includes('SET steps = ?')).at(-1);
  return (w?.values[0] as { key: string; state: string }[]).map((s) => `${s.key}:${s.state}`);
};
const image = { kind: 'image' as const, dataUrl: 'data:image/png;base64,AAAA' };

beforeEach(() => {
  h.calls.length = 0;
  h.ogChat.mockReset();
});

describe('async read status flow', () => {
  it('typed purchase → all steps done → ready, money only to the buyable parent', async () => {
    h.ogChat.mockImplementation(async (o: { job: string }) => juryByJob(o));
    const out = await readPurchase('p1', 'u1', rules, { kind: 'typed', product: 'iPhone 17 Pro', amount: '79900', currency: 'INR', maker: 'Apple' });
    expect(out.status).toBe('ready');
    expect(lastSteps()).toEqual(['read:done', 'convert:done', 'understand:done', 'jury:done', 'judge:done', 'resolve:done']);
    expect(h.ogChat.mock.calls.map((c) => (c[0] as { job: string }).job).sort()).toEqual(['judge', 'jury', 'jury', 'jury', 'understand']);
    const allocs = h.calls.filter((c) => c.text.includes('INSERT INTO allocations'));
    expect(allocs.map((c) => [c.values[2], c.values[3]])).toEqual([['co:apple', 'maker']]);
    expect(allocs[0]!.values[5]).toBe('Designs and sells the iPhone.');
    const analysis = h.calls.find((c) => c.text.includes('analysis = ?'))!.values.find((v) => (v as { parent?: unknown })?.parent) as { parent: { status: string; agree: number; of: number } };
    expect(analysis.parent).toMatchObject({ status: 'buyable', agree: 3, of: 3 });
  });

  it('no buyable row → not_listed, whole share to the fallback', async () => {
    h.ogChat.mockImplementation(async (o: { job: string }) => {
      const r = juryByJob(o);
      return o.job === 'understand' ? r : reply({ ...JSON.parse(r.content), parent: { name: 'Unilever', ticker: 'UL', why: 'Owns Dove.', agree: 3 } });
    });
    const out = await readPurchase('p2', 'u1', rules, { kind: 'typed', product: 'Dove soap', amount: '60', currency: 'INR', maker: 'Dove' });
    expect(out.status).toBe('not_listed');
    const allocs = h.calls.filter((c) => c.text.includes('INSERT INTO allocations'));
    expect(allocs.map((c) => [c.values[2], c.values[3]])).toEqual([['idx:sp500', 'fallback']]);
  });

  it('0G timeout → read_failed timeout (retryable), read step failed', async () => {
    h.ogChat.mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    const out = await readPurchase('p3', 'u1', rules, image);
    expect(out).toEqual({ status: 'read_failed', readError: 'timeout' });
    expect(lastSteps()[0]).toBe('read:failed');
  });

  it('0G error → og_unavailable, not not_a_receipt', async () => {
    h.ogChat.mockRejectedValue(Object.assign(new Error('0G chat 503'), { status: 503 }));
    expect(await readPurchase('p4', 'u1', rules, image)).toEqual({ status: 'read_failed', readError: 'og_unavailable' });
  });

  it('isReceipt=false → not_a_receipt', async () => {
    h.ogChat.mockResolvedValue(reply({ isReceipt: false, confidence: 0.9 }));
    expect(await readPurchase('p5', 'u1', rules, image)).toEqual({ status: 'read_failed', readError: 'not_a_receipt' });
  });

  it('missing total → needs_details with the fields saved and highlighted; no jury', async () => {
    h.ogChat.mockResolvedValue(reply({ isReceipt: true, merchant: 'Croma', currency: 'INR', total: null, items: [{ name: 'iPhone 17' }], confidence: 0.6 }));
    const out = await readPurchase('p6', 'u1', rules, image);
    expect(out.status).toBe('needs_details');
    expect(statusWrites()).toEqual(['needs_details']);
    const details = h.calls.find((c) => c.text.includes('SET details = ?'))!.values[0] as { merchant: string; missing: string[] };
    expect(details.merchant).toBe('Croma');
    expect(details.missing).toEqual(['date', 'total']);
    expect(h.ogChat.mock.calls.every((c) => (c[0] as { job: string }).job === 'read_receipt')).toBe(true);
  });

  it('unreadable JSON twice → needs_details with an empty form, not a dead end', async () => {
    h.ogChat.mockResolvedValue({ ...reply({}), content: 'I cannot help with that.' });
    expect((await readPurchase('p7', 'u1', rules, image)).status).toBe('needs_details');
  });
});
