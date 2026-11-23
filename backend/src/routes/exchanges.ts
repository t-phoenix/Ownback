/**
 * D47 "Compare exchanges": the same buy or sell quoted on Jupiter's best route (any exchange, may split) and on
 * each exchange the pool index can quote. Each row carries its own status (ok, pending, no_route, error). Exact figures from live quotes (buy quotes include the
 * D44 fee). Display and choice only: the swap re-quotes at signing and stops with ROUTE_CHANGED if the pick fails.
 */
import { Hono } from 'hono';
import { ApiError } from '../shared/errors.js';
import { toUsd6 } from '../shared/money.js';
import { verifiedMint } from '../shared/assets.js';
import { jsonError, requireUser } from '../lib/http.js';
import { ownbackFee } from '../lib/fees.js';
import { jupiterQuoteTry, rawToQty, SOL_USDC, type JupiterQuote, type QuoteMiss } from '../lib/jupiter-price.js';
import { EXCHANGES, poolIndex, routeExchanges } from '../lib/markets/pools.js';
import { DEFAULT_MAX_FEE_BPS } from '../shared/timing.js';

export const exchangeRoutes = new Hono();

/** Most exchanges quoted besides the best route (each is one Jupiter call). */
const MAX_EXCHANGES = 4;
/** How long one request waits for quotes; anything slower keeps running and is picked up by the next poll. */
const WAIT_MS = 1_200;
const TTL: Record<Status, number> = { ok: 15_000, no_route: 60_000, error: 5_000, pending: 0 };

type Status = 'ok' | 'no_route' | 'error' | 'pending';
type Result = { at: number; status: Exclude<Status, 'pending'>; q: JupiterQuote | null };
const cache = new Map<string, Result>();
const inflight = new Map<string, Promise<Result>>();

// Keyless Jupiter allows about 1 request a second: start one quote at a time, ~1.05 s apart (bursts got 429s and
// showed as "no quote"). With JUPITER_API_KEY quotes go out together.
let chain: Promise<unknown> = Promise.resolve();
function slot<T>(f: () => Promise<T>): Promise<T> {
  if (process.env.JUPITER_API_KEY) return f();
  const p = chain.then(f, f);
  chain = p.catch(() => {}).then(() => new Promise((r) => setTimeout(r, 1_050)));
  return p;
}

/** Cached result, or the quote started (once, shared by every caller) in the background. */
function quote(key: string, run: () => Promise<{ q: JupiterQuote | null; miss?: QuoteMiss }>, first = false, retryErrors = false): Result | Promise<Result> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL[hit.status] && !(retryErrors && hit.status === 'error')) return hit;
  let p = inflight.get(key);
  if (!p) {
    const go = async (): Promise<Result> => {
      const r = await run().catch(() => ({ q: null, miss: 'upstream' as QuoteMiss }));
      const res: Result = { at: Date.now(), status: r.q ? 'ok' : r.miss === 'no_route' ? 'no_route' : 'error', q: r.q };
      cache.set(key, res);
      if (cache.size > 2_000) for (const [k, v] of cache) if (Date.now() - v.at > TTL[v.status]) cache.delete(k);
      return res;
    };
    // The best route jumps the queue: it is the default and what most people use.
    p = (first ? go() : slot(go)).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

const hits = new Map<string, number[]>();
/** 60 a minute: polls are cheap (no new Jupiter call until a result expires). */
function rateLimit(userId: string) {
  const now = Date.now();
  const list = (hits.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= 60) throw new ApiError('RATE_LIMITED', { retryAfterMs: 60_000 - (now - list[0]!) });
  list.push(now); hits.set(userId, list);
}

const within = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms).unref?.())]);

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
    const idx = await within(poolIndex(mint.mint), 1_500);
    const picks = (idx?.exchanges ?? []).filter((e) => e.quotable).slice(0, MAX_EXCHANGES);
    const run = (dexes?: string) => () => jupiterQuoteTry({
      inputMint: side === 'buy' ? SOL_USDC : mint.mint, outputMint: side === 'buy' ? mint.mint : SOL_USDC,
      amountRaw: amt, slippageBps: 100, retries: 2, ...(fee ? { platformFeeBps: fee.bps } : {}), ...(dexes ? { dexes } : {}),
    });
    const base = `${mint.mint}:${side}:${amount}:${fee?.bps ?? 0}`;
    // `retry=1` (the app's Try again) asks again for rows that errored; everything else comes from cache.
    const retry = c.req.query('retry') === '1';
    const started = [quote(`${base}:best`, run(), true, retry), ...picks.map((e) => quote(`${base}:${e.key}`, run(EXCHANGES[e.key]!.dexes), false, retry))];
    // Wait a little for whatever is in flight; the rest come back as `pending` and the app polls for them.
    const deadline = Date.now() + WAIT_MS;
    const results = await Promise.all(started.map(async (r) => (r instanceof Promise ? await within(r, Math.max(0, deadline - Date.now())) : r)));
    const shape = (key: string, label: string, r: Result | null, ex?: (typeof picks)[number]) => {
      const q = r?.q ?? null;
      return {
        key, label,
        status: (r?.status ?? 'pending') as Status,
        outRaw: q?.outAmount ?? null,
        // Tokens for a buy, USDC (Usd6) for a sell.
        ...(q ? { out: side === 'buy' ? rawToQty(BigInt(q.outAmount), mint.decimals) : toUsd6(BigInt(q.outAmount)), minOut: side === 'buy' ? rawToQty(BigInt(q.otherAmountThreshold), mint.decimals) : toUsd6(BigInt(q.otherAmountThreshold)) } : {}),
        ...(q ? { impactBps: Math.round(Number(q.priceImpactPct) * 10_000) || 0, route: routeExchanges(q.routePlan), quotedAt: new Date(r!.at).toISOString() } : {}),
        ...(ex ? { liquidityUsd6: toUsd6(ex.liquidityUsd6), volume24hUsd6: toUsd6(ex.volume24hUsd6), pools: ex.pools } : {}),
      };
    };
    const options = rankOptions([
      shape('best', 'Best price', results[0]!),
      ...picks.map((e, i) => shape(e.key, e.label, results[i + 1]!, e)),
    ]);
    // No exchange list yet (cold pool index): keep the app polling; the index call is shared and lands in a second or two.
    const pending = options.filter((o) => o.status === 'pending').length + (idx ? 0 : 1);
    c.header('Cache-Control', 'no-store');
    return c.json({
      assetId, side, amount, token: mint.symbol, decimals: mint.decimals, at: new Date().toISOString(),
      feeIncluded: !!fee,
      // Not complete: ask again in `retryMs` for the rest (no new Jupiter call is made for rows already answered).
      complete: pending === 0, ...(pending ? { retryMs: process.env.JUPITER_API_KEY ? 500 : 1_100 } : {}),
      // The pool index didn't answer in time: the exchange list may be incomplete.
      ...(idx ? {} : { exchangesUnknown: true }),
      options,
      // Exchanges the token trades on that we can't quote (too shallow or not on Jupiter's list): shown, not offered.
      others: (idx?.exchanges ?? []).filter((e) => !picks.includes(e)).map((e) => ({ key: e.key, label: e.label, liquidityUsd6: toUsd6(e.liquidityUsd6) })),
    });
  } catch (e) {
    return jsonError(c, e);
  }
});
