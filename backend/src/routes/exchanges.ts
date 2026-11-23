/**
 * D47 "Compare exchanges": the same buy or sell quoted on Jupiter's best route (any exchange, may split) and on
 * each exchange the pool index can quote, one at a time. Exact figures from live quotes (buy quotes include the
 * D44 fee). Display and choice only: the swap re-quotes at signing and stops with ROUTE_CHANGED if the pick fails.
 */
import { Hono } from 'hono';
import { ApiError } from '../shared/errors.js';
import { toUsd6 } from '../shared/money.js';
import { verifiedMint } from '../shared/assets.js';
import { jsonError, requireUser } from '../lib/http.js';
import { ownbackFee } from '../lib/fees.js';
import { jupiterBuyQuote, jupiterSellQuote, rawToQty, type JupiterQuote } from '../lib/jupiter-price.js';
import { EXCHANGES, poolIndex, routeExchanges } from '../lib/markets/pools.js';
import { DEFAULT_MAX_FEE_BPS } from '../shared/timing.js';

export const exchangeRoutes = new Hono();

/** Most exchanges quoted besides the best route (each is one Jupiter call). */
const MAX_EXCHANGES = 4;
const BUDGET_MS = 1_500;
const TTL_MS = 15_000;
const cache = new Map<string, { at: number; q: JupiterQuote | null }>();

const hits = new Map<string, number[]>();
function rateLimit(userId: string) {
  const now = Date.now();
  const list = (hits.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= 20) throw new ApiError('RATE_LIMITED', { retryAfterMs: 60_000 - (now - list[0]!) });
  list.push(now); hits.set(userId, list);
}

const within = <T>(p: Promise<T>) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), BUDGET_MS).unref?.())]);

async function quoteOnce(key: string, run: () => Promise<JupiterQuote | null>): Promise<JupiterQuote | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.q;
  const q = await within(run().catch(() => null));
  if (q) cache.set(key, { at: Date.now(), q });
  if (cache.size > 2_000) for (const [k, v] of cache) if (Date.now() - v.at > TTL_MS) cache.delete(k);
  return q;
}

/**
 * Pure: the most out (tokens for a buy, USDC for a sell) is Recommended. An exchange that gives more than 5% less
 * than the best is `tooCostly` and can't be picked (the swap refuses it too). Exported for tests.
 */
export function rankOptions<T extends { outRaw: string | null }>(opts: T[]): (T & { recommended: boolean; diffBps: number | null; tooCostly: boolean })[] {
  const best = opts.reduce((m, o) => (o.outRaw && BigInt(o.outRaw) > m ? BigInt(o.outRaw) : m), 0n);
  let marked = false;
  return opts.map((o) => {
    const out = o.outRaw ? BigInt(o.outRaw) : null;
    const recommended = !marked && out != null && out === best && best > 0n;
    if (recommended) marked = true;
    const diffBps = out != null && best > 0n ? Number(((out - best) * 10_000n) / best) : null;
    return { ...o, recommended, diffBps, tooCostly: diffBps != null && diffBps < -DEFAULT_MAX_FEE_BPS };
  });
}

exchangeRoutes.get('/quotes/exchanges', async (c) => {
  try {
    const user = await requireUser(c);
    rateLimit(user.id);
    const assetId = c.req.query('assetId') ?? '';
    const side = c.req.query('side') === 'sell' ? 'sell' : 'buy';
    const amount = c.req.query(side === 'buy' ? 'amountUsd6' : 'amountRaw') ?? '';
    if (!/^\d{1,18}$/.test(amount) || BigInt(amount) <= 0n) throw new ApiError('VALIDATION', { issues: [{ path: [side === 'buy' ? 'amountUsd6' : 'amountRaw'], message: 'invalid' }] });
    const mint = verifiedMint(assetId, 'solana');
    if (!mint) throw new ApiError('NOT_FOUND', { reason: 'no_venue' });
    const amt = BigInt(amount);
    const fee = side === 'buy' ? ownbackFee() : null;
    const idx = await within(poolIndex(mint.mint));
    const picks = (idx?.exchanges ?? []).filter((e) => e.quotable).slice(0, MAX_EXCHANGES);
    const run = (dexes?: string) => () => (side === 'buy'
      ? jupiterBuyQuote(mint.mint, amt, 100, 1, fee?.bps, dexes)
      : jupiterSellQuote(mint.mint, amt, 100, 1, dexes));
    const base = `${mint.mint}:${side}:${amount}:${fee?.bps ?? 0}`;
    const quotes = await Promise.all([
      quoteOnce(`${base}:best`, run()),
      ...picks.map((e) => quoteOnce(`${base}:${e.key}`, run(EXCHANGES[e.key]!.dexes))),
    ]);
    const shape = (key: string, label: string, q: JupiterQuote | null, ex?: (typeof picks)[number]) => ({
      key, label,
      outRaw: q?.outAmount ?? null,
      // Tokens for a buy, USDC (Usd6) for a sell.
      ...(q ? { out: side === 'buy' ? rawToQty(BigInt(q.outAmount), mint.decimals) : toUsd6(BigInt(q.outAmount)), minOut: side === 'buy' ? rawToQty(BigInt(q.otherAmountThreshold), mint.decimals) : toUsd6(BigInt(q.otherAmountThreshold)) } : {}),
      ...(q ? { impactBps: Math.round(Number(q.priceImpactPct) * 10_000) || 0, route: routeExchanges(q.routePlan) } : {}),
      ...(ex ? { liquidityUsd6: toUsd6(ex.liquidityUsd6), volume24hUsd6: toUsd6(ex.volume24hUsd6), pools: ex.pools } : {}),
    });
    const options = rankOptions([
      shape('best', 'Best price', quotes[0]!),
      ...picks.map((e, i) => shape(e.key, e.label, quotes[i + 1]!, e)),
    ]);
    c.header('Cache-Control', 'private, max-age=10');
    return c.json({
      assetId, side, amount, token: mint.symbol, decimals: mint.decimals, at: new Date().toISOString(),
      feeIncluded: !!fee,
      options,
      // Exchanges the token trades on that we can't quote (too shallow or not on Jupiter's list): shown, not offered.
      others: (idx?.exchanges ?? []).filter((e) => !picks.includes(e)).map((e) => ({ key: e.key, label: e.label, liquidityUsd6: toUsd6(e.liquidityUsd6) })),
    });
  } catch (e) {
    return jsonError(c, e);
  }
});
