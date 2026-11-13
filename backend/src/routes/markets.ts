/**
 * Markets (docs/12-markets.md, D34–D38): browse verified xStocks, see prices and charts, buy or sell directly.
 * Buys reuse the D29/D33 pipeline (POST /buys with a `market` quote); sells reuse D31 (/sells).
 * Nothing here waits more than 2.5 s on a third party; prices come from the shared batched cache.
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { getSql } from '../db/client.js';
import { ApiError } from '../shared/errors.js';
import { toUsd6 } from '../shared/money.js';
import { CENT_USD6 } from '../shared/timing.js';
import { CHART_RANGES, MARKET_SORTS, type ChartRange, type MarketSort } from '../shared/markets.js';
import { jsonError, requireCsrf, requireUser } from '../lib/http.js';
import { portfolio } from '../lib/portfolio.js';
import { jupiterBuyQuote, valueUsd6 } from '../lib/jupiter-price.js';
import { relayConfigured } from '../lib/jupiter-swap.js';
import { mockChain } from '../lib/env.js';
import { EXPLORER } from '../shared/chains.js';
import { qtyToRaw } from '../lib/qty.js';
import { marketAsset, marketAssets, type MarketAsset } from '../lib/markets/catalog.js';
import { marketPrices, markViewed, sparklines, capWait } from '../lib/markets/prices.js';
import { getCandles, topPool } from '../lib/markets/candles.js';
import { usMarketState } from '../lib/markets/market-hours.js';
import { marketsEnabled } from '../lib/markets/jobs.js';
import { buildBuyReview, MIN_BUY_USD6 } from './jars-buys.js';

export const marketRoutes = new Hono();

const ARC_GAS_BUFFER_USD6 = 100_000n; // docs/05: leave $0.10 on Arc for gas

function guard() { if (!marketsEnabled()) throw new ApiError('FEATURE_OFF'); }

/** Small per-user limiter for routes that cost a Jupiter quote (spec §7). In-process; good enough for one instance. */
const hits = new Map<string, number[]>();
function rateLimit(userId: string, key: string, perMin: number) {
  const k = `${userId}:${key}`; const now = Date.now();
  const list = (hits.get(k) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= perMin) throw new ApiError('RATE_LIMITED', { retryAfterMs: 60_000 - (now - list[0]!) });
  list.push(now); hits.set(k, list);
  if (hits.size > 5_000) for (const [kk, v] of hits) if (!v.some((t) => now - t < 60_000)) hits.delete(kk);
}

const cmp = (a: bigint | null, b: bigint | null) => (a === b ? 0 : (b ?? -1n) > (a ?? -1n) ? 1 : -1);

/** Sort a market list. Pure; exported for tests. Unpriced rows always sink. */
export function sortMarkets<T extends { name: string; changeBps: number | null; liquidityUsd6: bigint | null; priceUsd6: bigint | null }>(rows: T[], sort: MarketSort): T[] {
  const out = [...rows];
  if (sort === 'az') return out.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'gainers' || sort === 'losers') {
    const dir = sort === 'gainers' ? -1 : 1;
    return out.sort((a, b) => (a.changeBps == null ? 1 : b.changeBps == null ? -1 : dir * (a.changeBps - b.changeBps)));
  }
  return out.sort((a, b) => cmp(a.liquidityUsd6, b.liquidityUsd6) || a.name.localeCompare(b.name));
}

async function heldIds(c: Context, user: Awaited<ReturnType<typeof requireUser>>): Promise<Map<string, { qty: string; valueUsd6: bigint; raw: bigint }>> {
  const p = await capWait(portfolio(user, { fresh: c.req.header('cache-control') === 'no-cache' }).catch(() => null));
  return new Map((p?.held ?? []).map((h) => [h.assetId, { qty: h.qty, valueUsd6: h.valueUsd6, raw: h.raw }]));
}

marketRoutes.get('/markets', async (c) => {
  try {
    guard();
    const user = await requireUser(c);
    const sort = (MARKET_SORTS as readonly string[]).includes(c.req.query('sort') ?? '') ? (c.req.query('sort') as MarketSort) : 'popular';
    const list = marketAssets();
    const [prices, sparks, held] = await Promise.all([marketPrices(list), sparklines(), heldIds(c, user)]);
    const rows = list.map((a) => ({ a, name: a.name, ...prices.get(a.assetId)! }));
    const oldest = rows.reduce((m, r) => (r.at && r.at < m ? r.at : m), Date.now());
    c.header('Cache-Control', 'private, max-age=15, stale-while-revalidate=120');
    return c.json({
      pricesAt: new Date(oldest).toISOString(),
      usMarket: usMarketState(),
      items: sortMarkets(rows, sort).map((r) => ({
        assetId: r.a.assetId, name: r.a.name, ticker: r.a.ticker, token: r.a.token, ...(r.a.icon ? { icon: r.a.icon } : {}),
        class: r.a.class, chain: r.a.chain,
        priceUsd6: r.priceUsd6 != null ? toUsd6(r.priceUsd6) : null,
        priceAt: r.at ? new Date(r.at).toISOString() : null,
        change24hBps: r.changeBps,
        liquidityUsd6: r.liquidityUsd6 != null ? toUsd6(r.liquidityUsd6) : null,
        spark: (sparks.get(r.a.assetId) ?? []).map((v) => v.toString()),
        held: held.has(r.a.assetId),
        ...(held.has(r.a.assetId) ? { positionUsd6: toUsd6(held.get(r.a.assetId)!.valueUsd6) } : {}),
      })),
    });
  } catch (e) {
    return jsonError(c, e);
  }
});

/** Light poll for the rows on screen (≤ 50). */
marketRoutes.get('/markets/prices', async (c) => {
  try {
    guard();
    const user = await requireUser(c);
    rateLimit(user.id, 'prices', 30);
    const ids = (c.req.query('ids') ?? '').split(',').filter(Boolean).slice(0, 50);
    const list = ids.map((id) => marketAsset(id)).filter((a): a is MarketAsset => !!a);
    const prices = await marketPrices(list);
    c.header('Cache-Control', 'private, max-age=5');
    return c.json({
      at: new Date().toISOString(),
      prices: Object.fromEntries(list.map((a) => {
        const p = prices.get(a.assetId)!;
        return [a.assetId, { priceUsd6: p.priceUsd6 != null ? toUsd6(p.priceUsd6) : null, priceAt: p.at ? new Date(p.at).toISOString() : null, change24hBps: p.changeBps }];
      })),
    });
  } catch (e) {
    return jsonError(c, e);
  }
});

// A $1 probe quote per asset, cached 5 min: tells the page "tradable" without a fresh quote per view.
const probe = new Map<string, { ok: boolean; at: number }>();
async function canRoute(mint: string): Promise<boolean | null> {
  const hit = probe.get(mint);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.ok;
  const q = await capWait(jupiterBuyQuote(mint, 1_000_000n).catch(() => null));
  if (q === undefined) return hit?.ok ?? null; // took too long: unknown, let the review decide
  probe.set(mint, { ok: !!q, at: Date.now() });
  return !!q;
}

type Trade = { kind: 'buy' | 'sell'; source: 'jar' | 'market' | 'holding'; at: Date; doneAt: Date | null; qty: string; amount: string; price: string | null; link: string; arcTx: string | null; solTx: string | null };
const TRADES_MAX = 50; // the page shows 5; "View all" lists these

marketRoutes.get('/markets/:assetId', async (c) => {
  try {
    guard();
    const user = await requireUser(c);
    const a = marketAsset(c.req.param('assetId'));
    if (!a) throw new ApiError('NOT_FOUND', { reason: 'not_listed' });
    markViewed(a.assetId);
    const sql = getSql();
    const [prices, p, routeOk, pool, buys, sells] = await Promise.all([
      marketPrices([a]),
      capWait(portfolio(user, { fresh: c.req.header('cache-control') === 'no-cache' }).catch(() => null)),
      canRoute(a.mint),
      capWait(topPool(a.mint).catch(() => null), 1_500),
      sql<{ batch_id: string; trigger: string; started_at: Date | null; finished_at: Date | null; qty: string | null; spent: string | null; fill: string | null; arc_tx: string | null; venue_tx: string | null }[]>`
        SELECT e.batch_id, b.trigger, b.started_at, b.finished_at, e.qty::text AS qty, e.spent_usd6::text AS spent,
          e.fill_price_usd6::text AS fill, b.arc_tx, e.venue_tx
        FROM buy_entries e JOIN buy_batches b ON b.id = e.batch_id
        WHERE e.user_id = ${user.id}::uuid AND e.asset_id = ${a.assetId} AND e.status = 'bought'
        ORDER BY b.started_at DESC NULLS LAST`,
      sql<{ id: string; source: string | null; created_at: Date; finished_at: Date | null; qty: string; received_usd6: string | null; venue_tx: string | null }[]>`
        SELECT id, source, created_at, finished_at, qty, received_usd6::text, venue_tx FROM sells
        WHERE user_id = ${user.id}::uuid AND asset_id = ${a.assetId} AND status = 'done' ORDER BY created_at DESC LIMIT ${TRADES_MAX}`,
    ]);
    const price = prices.get(a.assetId)!;
    const h = p?.held.find((x) => x.assetId === a.assetId);
    // Average cost over every buy (jar or market).
    let paid = 0n; let boughtRaw = 0n;
    for (const b of buys) { paid += BigInt(b.spent ?? '0'); boughtRaw += b.qty ? qtyToRaw(b.qty, a.decimals) ?? 0n : 0n; }
    const avg = boughtRaw > 0n ? (paid * 10n ** BigInt(a.decimals)) / boughtRaw : 0n;
    const cost = h && avg > 0n ? valueUsd6(h.raw, a.decimals, avg) : 0n;
    const pnl = h && avg > 0n ? h.valueUsd6 - cost : null;
    const trades: Trade[] = [
      ...buys.map((b) => ({ kind: 'buy' as const, source: (b.trigger === 'market' ? 'market' : 'jar') as Trade['source'], at: b.started_at ?? new Date(), doneAt: b.finished_at, qty: (b.qty ?? '0').replace(/\.?0+$/, ''), amount: b.spent ?? '0', price: b.fill, link: `/buy/${b.batch_id}`, arcTx: b.arc_tx, solTx: b.venue_tx })),
      ...sells.map((s) => {
        const raw = qtyToRaw(s.qty, a.decimals) ?? 0n;
        const price = raw > 0n && s.received_usd6 ? ((BigInt(s.received_usd6) * 10n ** BigInt(a.decimals)) / raw).toString() : null;
        return { kind: 'sell' as const, source: (s.source === 'market' ? 'market' : 'holding') as Trade['source'], at: s.created_at, doneAt: s.finished_at, qty: s.qty.replace(/\.?0+$/, ''), amount: s.received_usd6 ?? '0', price, link: `/sell/${s.id}`, arcTx: null, solTx: s.venue_tx };
      }),
    ].sort((x, y) => y.at.getTime() - x.at.getTime()).slice(0, TRADES_MAX);
    const solUsdc = p?.solUsdc ?? 0n; const arcUsdc = p?.arcUsdc ?? 0n;
    const arcSpendable = arcUsdc > ARC_GAS_BUFFER_USD6 ? arcUsdc - ARC_GAS_BUFFER_USD6 : 0n;
    const relayOk = mockChain() || relayConfigured();
    const reason = !relayOk ? 'relay_off' : routeOk === false ? 'no_route' : undefined;
    return c.json({
      assetId: a.assetId, name: a.name, ticker: a.ticker, token: a.token, ...(a.icon ? { icon: a.icon } : {}),
      class: a.class, chain: a.chain, mint: a.mint, decimals: a.decimals, issuer: a.issuer,
      links: { mint: `https://solscan.io/token/${a.mint}`, issuer: 'https://xstocks.com/products' },
      priceUsd6: price.priceUsd6 != null ? toUsd6(price.priceUsd6) : null,
      priceAt: price.at ? new Date(price.at).toISOString() : null,
      change24hBps: price.changeBps,
      liquidityUsd6: price.liquidityUsd6 != null ? toUsd6(price.liquidityUsd6) : pool?.liquidity_usd6 ?? null,
      volume24hUsd6: pool?.volume24h_usd6 ?? null,
      usMarket: usMarketState(),
      position: h ? { qty: h.qty, valueUsd6: toUsd6(h.valueUsd6), avgCostUsd6: toUsd6(avg), ...(pnl != null ? { pnlUsd6: pnl.toString(), pnlBps: cost > 0n ? Number((pnl * 10_000n) / cost) : 0 } : {}) } : null,
      tradable: { buy: !reason, sell: !!h && relayOk, ...(reason ? { reason } : !h ? { reason: 'nothing_held' as const } : {}) },
      funds: { solanaUsdcUsd6: toUsd6(solUsdc), arcUsdcUsd6: toUsd6(arcUsdc), maxBuyUsd6: toUsd6(((solUsdc + arcSpendable) / CENT_USD6) * CENT_USD6) },
      recent: trades.map((t) => ({
        kind: t.kind, source: t.source, at: t.at.toISOString(), ...(t.doneAt ? { doneAt: t.doneAt.toISOString() } : {}),
        qty: t.qty, amountUsd6: toUsd6(t.amount), ...(t.price && BigInt(t.price) > 0n ? { priceUsd6: toUsd6(t.price) } : {}), link: t.link,
        txs: { ...(t.arcTx ? { arc: EXPLORER.arcTx(t.arcTx) } : {}), ...(t.solTx ? { solana: EXPLORER.solTx(t.solTx) } : {}) },
      })),
    });
  } catch (e) {
    return jsonError(c, e);
  }
});

marketRoutes.get('/markets/:assetId/candles', async (c) => {
  try {
    guard();
    await requireUser(c);
    const a = marketAsset(c.req.param('assetId'));
    if (!a) throw new ApiError('NOT_FOUND', { reason: 'not_listed' });
    const range = (CHART_RANGES as readonly string[]).includes(c.req.query('range') ?? '') ? (c.req.query('range') as ChartRange) : '1D';
    const set = await capWait(getCandles(a, range), 5_000);
    c.header('Cache-Control', 'private, max-age=30, stale-while-revalidate=300');
    return c.json(set ?? { range, interval: '1d', source: 'ownback', stale: true, candles: [], reason: 'upstream' });
  } catch (e) {
    return jsonError(c, e);
  }
});

/** One-asset buy quote (D35). The quote is tagged `market`; POST /buys then never touches jars. */
marketRoutes.post('/markets/buy/review', async (c) => {
  try {
    guard();
    requireCsrf(c);
    const user = await requireUser(c);
    const body = z.object({ assetId: z.string().min(1), amountUsd6: z.string().regex(/^\d+$/) }).parse(await c.req.json());
    const a = marketAsset(body.assetId);
    if (!a) throw new ApiError('NOT_FOUND', { reason: 'not_listed' });
    const amount = (BigInt(body.amountUsd6) / CENT_USD6) * CENT_USD6;
    if (amount < MIN_BUY_USD6) throw new ApiError('VALIDATION', { issues: [{ path: ['amountUsd6'], message: 'min_0.10' }] });
    rateLimit(user.id, 'review', 20);
    const review = await buildBuyReview(user, 'all', new Map([[a.assetId, amount]]), 'market');
    const row = review.rows[0];
    if (!row) throw new ApiError('UPSTREAM', { reason: 'no_route' });
    return c.json({ ...review, row });
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});
