import { assetDisplayName } from '../lib/asset-name.js';
import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getSql } from '../db/client.js';
import { ApiError } from '../shared/errors.js';
import { asUsd6, toUsd6 } from '../shared/money.js';
import { CENT_USD6, QUOTE_REFRESH_MS } from '../shared/timing.js';
import { EXPLORER, USDC } from '../shared/chains.js';
import { buildFees, feeWithinCap, ownbackFee, ownbackFeeUsd6 } from '../lib/fees.js';
import { jarState } from '../lib/limits.js';
import { mockChain } from '../lib/env.js';
import { assertIdempotencyKey, jsonError, mockEvmAction, requireCsrf, requireUser, withIdempotency } from '../lib/http.js';
import { newId } from '../lib/ids.js';
import { readAssetFromArkiv } from '../lib/arkiv/read-asset.js';
import { companyOf, iconField, tokenAssetsOf, verifiedMint } from '../shared/assets.js';
import { getCatalogCompany } from '../lib/registry/catalog.js';
import { gapBps, refPrices, tokenStats } from '../lib/token-stats.js';
import { dexesOfVenue, poolIndex, routeExchanges, venueFor, venueLabel } from '../lib/markets/pools.js';
import { buySwapCostUsd6, jupiterBuyQuote, jupiterPriceUsd6, priceUsd6FromBuyQuote, rawToQty, routeFeeUsd6, valueUsd6 } from '../lib/jupiter-price.js';
import { buildUserSwap, relayConfigured, submitSigned, tokenBalanceRaw, tokenDeltaInTx } from '../lib/jupiter-swap.js';
import {
  advanceBatch,
  arcBridgeCalls,
  arcBridgeGasUsd6,
  arcPublic,
  arcUsdcBalance,
  debitJars,
  logEvent,
  verifyArcBurn,
} from '../lib/buy-pipeline.js';
import { pipelineError } from '../lib/pipeline-error.js';

/** Smallest buy we build (testing with small numbers is a feature; dust routes are not). */
export const MIN_BUY_USD6 = 100_000n;
const SOL_USDC = USDC.solana.value;

export const jarsBuysRoutes = new Hono();

function roundCent(n: bigint): bigint {
  return (n / CENT_USD6) * CENT_USD6;
}

function parseAmounts(raw: string | undefined): Map<string, bigint> {
  const out = new Map<string, bigint>();
  if (!raw) return out;
  try {
    const obj = JSON.parse(raw) as Record<string, string>;
    for (const [k, v] of Object.entries(obj)) {
      if (!/^\d+$/.test(v)) continue;
      const n = roundCent(BigInt(v));
      if (n > 0n) out.set(k, n);
    }
  } catch {
    /* ignore bad amounts */
  }
  return out;
}

jarsBuysRoutes.get('/jars', async (c) => {
  try {
    const user = await requireUser(c);
    const sql = getSql();
    const rules = await sql<{ ready_min_usd6: bigint; max_fee_bps: number }[]>`
      SELECT ready_min_usd6, max_fee_bps FROM rules WHERE user_id = ${user.id}::uuid
    `;
    const readyMin = BigInt(rules[0]?.ready_min_usd6 ?? 5_000_000n);
    const rows = await sql<{ asset_id: string; amt: bigint | string; role: string }[]>`
      SELECT a.asset_id, a.role, COALESCE(SUM(a.saved_usd6 - a.bought_usd6), 0) AS amt
      FROM allocations a
      JOIN purchases p ON p.id = a.purchase_id
      WHERE p.user_id = ${user.id}::uuid AND p.status = 'saved' AND a.selected = true
      GROUP BY a.asset_id, a.role
      HAVING COALESCE(SUM(a.saved_usd6 - a.bought_usd6), 0) > 0
    `;
    // D46: one jar per company and role; money saved to a token id before D46 joins its company's jar.
    const folded = new Map<string, { asset_id: string; role: string; amt: bigint }>();
    for (const r of rows) {
      const id = companyOf(r.asset_id);
      const cur = folded.get(`${id}|${r.role}`);
      folded.set(`${id}|${r.role}`, { asset_id: id, role: r.role, amt: (cur?.amt ?? 0n) + BigInt(r.amt) });
    }
    const jars = await Promise.all([...folded.values()].map(async (r) => {
      const amt = BigInt(r.amt);
      // Price of one token (one share for xStocks); only for verified mints, never invented.
      const mint = verifiedMint(r.asset_id, 'solana');
      const price = mint ? await jupiterPriceUsd6(mint.mint, { display: true }) : null;
      return {
        assetId: r.asset_id,
        name: assetDisplayName(r.asset_id),
        ...iconField(r.asset_id),
        role: r.role,
        amountUsd6: toUsd6(amt),
        readyMinUsd6: toUsd6(readyMin),
        state: jarState(amt, readyMin),
        ...(mint && price ? { token: mint.symbol, price: { usd6PerUnit: toUsd6(price), at: new Date().toISOString(), source: 'jupiter' as const } } : {}),
      };
    }));
    return c.json({
      jars,
      nextReminderAt: nextSundayReminder(),
      estFeesUsd6: '0',
    });
  } catch (e) {
    return jsonError(c, e);
  }
});

function nextSundayReminder(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 4, 30, 0));
  const day = d.getUTCDay();
  const add = day === 0 && now < d ? 0 : (7 - day) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString();
}

jarsBuysRoutes.post('/jars/:assetId/cancel', async (c) => {
  try {
    requireCsrf(c);
    await requireUser(c);
    return c.json({
      action: mockEvmAction(`Cancel jar for ${c.req.param('assetId')}`),
    });
  } catch (e) {
    return jsonError(c, e);
  }
});


type User = Awaited<ReturnType<typeof requireUser>>;

async function solUsdc(user: User): Promise<bigint> {
  if (mockChain() || !user.solAddress) return 0n;
  return tokenBalanceRaw(user.solAddress, SOL_USDC).catch(() => 0n);
}

/** `source: 'market'` (D35): a direct buy from Markets. Same quotes and checks; the quote is tagged so /buys never debits jars. */
export async function buildBuyReview(user: User, include: 'all' | 'ready', amounts: Map<string, bigint>, source: 'jar' | 'market' = 'jar') {
  const sql = getSql();
  // Speed: wallet balances (slowest reads) start now and run alongside the DB reads and quotes.
  const funding = Promise.all([
    solUsdc(user),
    !mockChain() && user.evmAddress ? arcUsdcBalance(user.evmAddress).catch(() => 0n) : Promise.resolve(0n),
  ]);
  funding.catch(() => {}); // awaited below; never an unhandled rejection if we throw first
  const [rules, jarRows] = await Promise.all([
    sql<{ ready_min_usd6: bigint | string; max_fee_bps: number | string }[]>`
      SELECT ready_min_usd6, max_fee_bps FROM rules WHERE user_id = ${user.id}::uuid
    `,
    sql<{ asset_id: string; amt: bigint | string }[]>`
      SELECT a.asset_id, COALESCE(SUM(a.saved_usd6 - a.bought_usd6), 0) AS amt
      FROM allocations a JOIN purchases p ON p.id = a.purchase_id
      WHERE p.user_id = ${user.id}::uuid AND p.status = 'saved' AND a.selected = true
      GROUP BY a.asset_id
      HAVING COALESCE(SUM(a.saved_usd6 - a.bought_usd6), 0) > 0
    `,
  ]);
  if (!rules[0]) throw new ApiError('VALIDATION', { reason: 'no_rules' });
  const readyMin = BigInt(rules[0].ready_min_usd6);
  const maxFeeBps = Number(rules[0].max_fee_bps);
  const jars = new Map<string, bigint>();
  for (const r of jarRows) jars.set(companyOf(r.asset_id), (jars.get(companyOf(r.asset_id)) ?? 0n) + BigInt(r.amt)); // D46
  // Typed amounts scope the review to those assets only (one jar tap → one row). Empty amounts = all ready / all jars.
  const ids =
    amounts.size > 0
      ? [...new Set([...amounts.keys()].filter((k) => jars.has(k) || Boolean(verifiedMint(k, 'solana'))))]
      : [...jars].filter(([, amt]) => include === 'all' || jarState(amt, readyMin) === 'ready').map(([id]) => id);
  if (!ids.length) throw new ApiError('NO_READY_JARS');

  const now = new Date().toISOString();
  // D46: a company jar can buy any of the company's tokens; a Markets buy (or a tapped token) buys that token only.
  const tokensFor = (id: string) => {
    if (source === 'market' || id !== companyOf(id)) return [id];
    const all = tokenAssetsOf(id, 'solana').map((a) => a.assetId);
    return all.length ? all : [id];
  };
  const allTokens = [...new Set(ids.flatMap(tokensFor))];
  const mintsAll = allTokens.map((t) => verifiedMint(t, 'solana')?.mint).filter((m): m is string => !!m);
  const tickers = [...new Set(allTokens.map((t) => getCatalogCompany(companyOf(t))?.ticker).filter((t): t is string => !!t))];
  // Display stats for every token in one batched call each (no per-row requests).
  const statsP = Promise.all([tokenStats(mintsAll), refPrices(tickers)]).catch(() => [new Map(), new Map()] as const);
  const fee = ownbackFee();

  /** Exact quote for one token at this size (D44 fee included), its measured cost, and its market numbers. */
  const option = async (token: string, spend: bigint) => {
    const mint = verifiedMint(token, 'solana');
    const own = ownbackFeeUsd6(spend);
    const [quote, oracle, arkiv, [stats, refs]] = await Promise.all([
      mint ? jupiterBuyQuote(mint.mint, spend, 100, undefined, fee?.bps) : null,
      mint ? jupiterPriceUsd6(mint.mint) : null,
      readAssetFromArkiv(token, 'solana').catch(() => null),
      statsP,
    ]);
    const outRaw = quote ? BigInt(quote.outAmount) : 0n;
    const priceUsd6 = mint && outRaw > 0n ? priceUsd6FromBuyQuote(spend, outRaw, mint.decimals) : 0n;
    // Measured round trip on what actually reaches the pool (docs/05); the reference-price gap only as a fallback.
    const swapped = spend - own;
    const measured = mint && outRaw > 0n ? await buySwapCostUsd6(mint.mint, swapped, outRaw) : null;
    const routeFee = measured ?? (mint && oracle ? routeFeeUsd6(swapped, valueUsd6(outRaw, mint.decimals, asUsd6(oracle))) : 0n);
    const fees = buildFees([{ label: 'Jupiter route', usd6: routeFee }, ...(own > 0n ? [{ label: 'Ownback fee', usd6: own }] : [])], spend, maxFeeBps, false);
    const selectable = Boolean(mint) && outRaw > 0n && feeWithinCap(routeFee + own, spend, maxFeeBps);
    const st = mint ? stats.get(mint.mint) : undefined;
    const ticker = getCatalogCompany(companyOf(token))?.ticker;
    const gap = gapBps(st?.priceUsd6 ?? null, ticker ? refs.get(ticker) : undefined);
    return {
      assetId: token,
      ...(mint ? { token: mint.symbol, mint: mint.mint, decimals: mint.decimals, issuer: mint.issuer } : {}),
      ...iconField(token),
      chain: 'solana' as const,
      venue: 'jupiter' as const,
      price: { usd6PerUnit: toUsd6(priceUsd6), at: now, source: 'jupiter' as const },
      refPriceUsd6: toUsd6(oracle ?? 0n),
      estQty: mint && outRaw > 0n ? rawToQty(outRaw, mint.decimals) : '0',
      // Worst case after slippage protection: the swap fails rather than give less.
      minQty: mint && quote ? rawToQty(BigInt(quote.otherAmountThreshold), mint.decimals) : '0',
      fees,
      selectable,
      ...(selectable ? {} : { reason: (mint ? 'fees_high' : 'no_venue') as 'fees_high' | 'no_venue' }),
      ...(arkiv ? { arkiv } : {}),
      ...(st?.mcapUsd6 ? { mcapUsd6: toUsd6(st.mcapUsd6) } : {}),
      ...(st?.volume24hUsd6 ? { volume24hUsd6: toUsd6(st.volume24hUsd6) } : {}),
      ...(st?.liquidityUsd6 ? { liquidityUsd6: toUsd6(st.liquidityUsd6) } : {}),
      ...(gap != null ? { gapBps: gap } : {}),
      // D47: which exchanges the best route uses, and the token's market across all exchanges.
      route: quote ? routeExchanges(quote.routePlan) : [],
      ...(st?.exchanges != null ? { exchanges: st.exchanges, thin: !!st.thin } : {}),
    };
  };

  const rows = await Promise.all(
    ids.map(async (assetId) => {
      const jarAmt = asUsd6(jars.get(assetId) ?? 0n);
      const spend = asUsd6(amounts.get(assetId) ?? jarAmt);
      const options = await Promise.all(tokensFor(assetId).map((t) => option(t, spend)));
      const recommended = pickRecommended(options);
      // A token the user named (Markets, a holding's Buy more) stays chosen when it can be bought.
      const named = assetId !== companyOf(assetId) || source === 'market' ? options.find((o) => o.assetId === assetId && o.selectable) : undefined;
      const chosen = named ?? options.find((o) => o.assetId === recommended) ?? options[0]!;
      return {
        ...chosen,
        assetId,
        name: assetDisplayName(companyOf(assetId)),
        ...iconField(chosen.assetId),
        amountUsd6: toUsd6(spend),
        jarAmountUsd6: toUsd6(jarAmt),
        suggestedUsd6: toUsd6(jarAmt),
        tokenAssetId: chosen.assetId,
        ...(recommended ? { recommended } : {}),
        options: options.map((o) => ({ ...o, recommended: o.assetId === recommended })),
      };
    }),
  );

  const picked = rows.filter((r) => r.selectable);
  const total = picked.reduce((a, r) => a + BigInt(r.amountUsd6), 0n);
  // Sum each fee line (Jupiter route, Ownback fee) across the picked rows.
  const feeParts = new Map<string, bigint>();
  for (const r of picked) for (const p of r.fees.parts) feeParts.set(p.label, (feeParts.get(p.label) ?? 0n) + BigInt(p.usd6));
  const [onSolana, onArc] = await funding;
  const bridge = total > onSolana ? total - onSolana : 0n;
  const arcGas = bridge > 0n ? await arcBridgeGasUsd6() : 0n;
  const quoteId = newId();
  const expiresAt = new Date(Date.now() + QUOTE_REFRESH_MS).toISOString();
  await sql`
    INSERT INTO quotes (id, user_id, payload, expires_at)
    VALUES (${quoteId}::uuid, ${user.id}::uuid, ${sql.json({
      // D46: `token` is the default token for this jar; `choices` are the tokens the buyer may switch to.
      rows: picked.map((r) => ({ assetId: r.assetId, amountUsd6: r.amountUsd6, token: r.tokenAssetId, choices: r.options.filter((o) => o.selectable).map((o) => o.assetId) })),
      totalUsd6: total.toString(),
      source,
    } as never)}, ${new Date(expiresAt)})
  `;
  return {
    quoteId,
    expiresAt,
    rows,
    totalUsd6: toUsd6(total),
    fees: buildFees(feeParts.size ? [...feeParts].map(([label, usd6]) => ({ label, usd6 })) : [{ label: 'Jupiter route', usd6: 0n }], total > 0n ? total : 1n, maxFeeBps, false),
    funding: { solanaUsdc6: toUsd6(onSolana), arcUsdc6: toUsd6(onArc), bridgeUsd6: toUsd6(bridge) },
    // Paid on top of the amount: Arc gas from the user's Arc USDC when bridging (approx.); Solana fees by the relay.
    network: { ...(arcGas != null ? { arcUsd6: toUsd6(arcGas) } : {}), solanaPaidBy: 'ownback' as const },
    destination: user.solAddress ?? '',
  };
}

/** D46: cheapest all-in (route + Ownback fee) buyable token; more liquidity breaks a tie. Pure; exported for tests. */
export function pickRecommended(options: { assetId: string; selectable: boolean; fees: { totalUsd6: string }; liquidityUsd6?: string }[]): string | undefined {
  const ok = options.filter((o) => o.selectable);
  const liq = (o: (typeof ok)[number]) => BigInt(o.liquidityUsd6 ?? '0');
  ok.sort((a, b) => {
    const d = BigInt(a.fees.totalUsd6) - BigInt(b.fees.totalUsd6);
    return d < 0n ? -1 : d > 0n ? 1 : liq(b) > liq(a) ? 1 : liq(b) < liq(a) ? -1 : 0;
  });
  return ok[0]?.assetId;
}

/**
 * D46: the token each jar buys. The buyer's pick wins only when it was one of that jar's buyable choices in the
 * signed-off review; otherwise the default. Returns rows keyed by the token bought. Pure; exported for tests.
 */
export function pickTokens(
  rows: { assetId: string; amountUsd6: string; token?: string; choices?: string[] }[],
  tokens: Record<string, string> = {},
): { assetId: string; jarId: string; amountUsd6: string }[] {
  const out = rows.map((r) => {
    const want = tokens[r.assetId];
    if (want && !(r.choices ?? []).includes(want)) throw new ApiError('VALIDATION', { reason: 'token_not_offered', assetId: r.assetId });
    return { assetId: want ?? r.token ?? r.assetId, jarId: r.assetId, amountUsd6: r.amountUsd6 };
  });
  if (new Set(out.map((r) => r.assetId)).size !== out.length) throw new ApiError('VALIDATION', { reason: 'same_token_twice' });
  return out;
}

/**
 * D47: the exchange each bought token is held to. 'best' (or nothing) = Jupiter over every exchange. Any other key
 * must be an exchange the pool index can quote for that token; otherwise the request is refused, never re-routed.
 */
export async function pickVenues(rows: { assetId: string; jarId: string }[], exchanges: Record<string, string> = {}): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const r of rows) {
    const key = exchanges[r.jarId];
    if (!key || key === 'best') { out.set(r.assetId, 'jupiter'); continue; }
    const mint = verifiedMint(r.assetId, 'solana');
    const idx = mint ? await poolIndex(mint.mint) : null;
    if (!idx?.exchanges.some((e) => e.key === key && e.quotable)) throw new ApiError('VALIDATION', { reason: 'exchange_not_offered', assetId: r.jarId });
    out.set(r.assetId, venueFor(key));
  }
  return out;
}

function parseAmountMap(obj: Record<string, string> | undefined): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const [k, v] of Object.entries(obj ?? {})) {
    const n = (BigInt(v) / CENT_USD6) * CENT_USD6; // whole cents
    if (n === 0n) continue;
    if (n < MIN_BUY_USD6) throw new ApiError('VALIDATION', { issues: [{ path: ['amounts', k], message: 'min_0.10' }] });
    out.set(k, n);
  }
  return out;
}

jarsBuysRoutes.get('/buys/review', async (c) => {
  try {
    const user = await requireUser(c);
    const include = c.req.query('include') === 'all' ? 'all' : 'ready';
    let raw: Record<string, string> | undefined;
    try { raw = JSON.parse(c.req.query('amounts') ?? '{}'); } catch { raw = undefined; }
    return c.json(await buildBuyReview(user, include, parseAmountMap(raw)));
  } catch (e) {
    return jsonError(c, e);
  }
});

jarsBuysRoutes.post('/buys/review', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const body = z
      .object({ include: z.enum(['all', 'ready']).optional(), amounts: z.record(z.string().regex(/^\d+$/)).optional() })
      .parse(await c.req.json().catch(() => ({})));
    return c.json(await buildBuyReview(user, body.include === 'all' ? 'all' : 'ready', parseAmountMap(body.amounts)));
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

/** Starts a buy. Returns the Arc action to sign when USDC must first move from Arc to Solana. */
jarsBuysRoutes.post('/buys', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const key = assertIdempotencyKey(c);
    // D46: `tokens` = { jarId: tokenAssetId } for jars where the buyer picked another token than the default.
    // D47: `exchanges` = { jarId: exchangeKey | 'best' } when the buyer held a token to one exchange.
    const body = z.object({ quoteId: z.string().uuid(), tokens: z.record(z.string()).optional(), exchanges: z.record(z.string().max(40)).optional() }).parse(await c.req.json());
    const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const out = await withIdempotency(user.id, key, hash, async () => {
      const sql = getSql();
      const q = await sql<{ payload: { rows: { assetId: string; amountUsd6: string; token?: string; choices?: string[] }[]; totalUsd6: string; source?: 'jar' | 'market' }; expires_at: Date }[]>`
        SELECT payload, expires_at FROM quotes WHERE id = ${body.quoteId}::uuid AND user_id = ${user.id}::uuid
      `;
      if (!q[0]) throw new ApiError('NOT_FOUND');
      if (q[0].expires_at.getTime() < Date.now()) throw new ApiError('QUOTE_EXPIRED');
      const rows = pickTokens(q[0].payload.rows.filter((r) => BigInt(r.amountUsd6) > 0n), body.tokens);
      if (!rows.length) throw new ApiError('NOTHING_TO_BUY');
      const venues = await pickVenues(rows, body.exchanges);
      const total = rows.reduce((s, r) => s + BigInt(r.amountUsd6), 0n);
      const batchId = newId();
      const trigger = q[0].payload.source === 'market' ? 'market' : 'user';

      if (mockChain()) {
        await sql`INSERT INTO buy_batches (id, trigger, user_id, domain, status, total_usd6, started_at) VALUES (${batchId}::uuid, ${trigger}, ${user.id}::uuid, 5, 'done', ${total.toString()}::bigint, now())`;
        for (const r of rows) {
          const mint = verifiedMint(r.assetId, 'solana');
          const quote = mint ? await jupiterBuyQuote(mint.mint, BigInt(r.amountUsd6)) : null;
          const qty = mint && quote ? rawToQty(BigInt(quote.outAmount), mint.decimals) : '0';
          await sql`INSERT INTO buy_entries (id, batch_id, user_id, asset_id, status, amount_usd6, spent_usd6, item_index, venue, qty)
            VALUES (${newId()}::uuid, ${batchId}::uuid, ${user.id}::uuid, ${r.assetId}, 'bought', ${r.amountUsd6}::bigint, ${r.amountUsd6}::bigint, 0, ${venues.get(r.assetId) ?? 'jupiter'}, ${qty}::numeric)`;
          if (trigger !== 'market') await debitJars(user.id, r.assetId, BigInt(r.amountUsd6));
          await logEvent(user.id, 'buy_done', { amountUsd6: r.amountUsd6, assetId: r.assetId, qty, token: mint?.symbol }, `/holdings/${r.assetId}`);
        }
        return { batchId, batchIds: [batchId] };
      }

      if (!user.solAddress) throw new ApiError('NO_SOLANA_RECIPIENT', { reason: 'no_solana_wallet' });
      if (!relayConfigured()) throw new ApiError('KEEPER_DISABLED', { reason: 'relay_not_configured' });
      const onSolana = await solUsdc(user);
      const bridge = total > onSolana ? total - onSolana : 0n;
      let calls: Awaited<ReturnType<typeof arcBridgeCalls>> = [];
      if (bridge > 0n) {
        if (!user.evmAddress) throw new ApiError('INSUFFICIENT_FREE', { availableUsd6: onSolana.toString(), where: 'solana', reason: 'no_arc_wallet' });
        calls = await arcBridgeCalls(user.evmAddress, user.solAddress, bridge);
      }
      await sql`
        INSERT INTO buy_batches (id, trigger, user_id, domain, status, total_usd6, bridge_usd6, started_at)
        VALUES (${batchId}::uuid, ${trigger}, ${user.id}::uuid, 5, ${bridge > 0n ? 'bridging' : 'swap_ready'}, ${total.toString()}::bigint, ${bridge.toString()}::bigint, now())
      `;
      let i = 0;
      for (const r of rows) {
        await sql`INSERT INTO buy_entries (id, batch_id, user_id, asset_id, status, amount_usd6, item_index, venue)
          VALUES (${newId()}::uuid, ${batchId}::uuid, ${user.id}::uuid, ${r.assetId}, 'quoted', ${r.amountUsd6}::bigint, ${i++}, ${venues.get(r.assetId) ?? 'jupiter'})`;
      }
      return {
        batchId,
        batchIds: [batchId],
        ...(calls.length
          ? {
              action: {
                kind: 'evm_calls' as const,
                chain: 'arc' as const,
                calls: calls.map(({ to, data, value }) => ({ to, data, value })),
                labels: calls.map((x) => x.label),
                summary: `Move ${toUsd6(bridge)} USDC from Arc to your Solana wallet`,
                expect: { assets: [], amountsUsd6: [bridge.toString()] },
              },
            }
          : {}),
      };
    });
    return c.json(out);
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

type Batch = { id: string; user_id: string; trigger: string; status: string; bridge_usd6: bigint; arc_tx: string | null; mint_tx: string | null; total_usd6: bigint; error: string | null; started_at: Date | null };

async function loadBatch(user: User, id: string): Promise<Batch> {
  const [b] = await getSql()<Batch[]>`SELECT * FROM buy_batches WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid`;
  if (!b) throw new ApiError('NOT_FOUND');
  return b;
}

/** The user's Arc tx is in: verify its Withdrawn event before moving on. */
jarsBuysRoutes.post('/buys/:batchId/arc-submitted', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const { txHash } = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }).parse(await c.req.json());
    const b = await loadBatch(user, c.req.param('batchId'));
    if (b.status !== 'bridging') return c.json({ status: b.status });
    await verifyArcBurn(txHash, user.evmAddress!, BigInt(b.bridge_usd6));
    await getSql()`UPDATE buy_batches SET arc_tx = ${txHash}, status = 'attesting', error = NULL, updated_at = now() WHERE id = ${b.id}::uuid AND status = 'bridging'`;
    void advanceBatch(b.id);
    return c.json({ status: 'attesting' });
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

type Entry = { id: string; asset_id: string; status: string; amount_usd6: bigint; spent_usd6: bigint | null; fill_price_usd6: bigint | null; qty: string | null; venue: string | null; venue_tx: string | null; error: string | null; swap_msg_hash: string | null };

async function loadEntry(batchId: string, assetId: string): Promise<Entry> {
  const [e] = await getSql()<Entry[]>`SELECT * FROM buy_entries WHERE batch_id = ${batchId}::uuid AND asset_id = ${assetId}`;
  if (!e) throw new ApiError('NOT_FOUND');
  return e;
}

/** Build the Jupiter swap for one asset: relay pays gas and has signed; the user signs next. */
jarsBuysRoutes.post('/buys/:batchId/swaps/:assetId', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const b = await loadBatch(user, c.req.param('batchId'));
    if (b.status !== 'swap_ready' && b.status !== 'swapping') throw new ApiError('DEPOSIT_NOT_READY', { status: b.status });
    const e = await loadEntry(b.id, c.req.param('assetId'));
    if (e.status === 'bought') throw new ApiError('VALIDATION', { reason: 'already_bought' });
    // D47: after ROUTE_CHANGED the buyer can switch this token to the best route over every exchange.
    const body = z.object({ route: z.literal('best').optional() }).parse(await c.req.json().catch(() => ({})));
    if (body.route === 'best' && e.venue !== 'jupiter') {
      await getSql()`UPDATE buy_entries SET venue = 'jupiter' WHERE id = ${e.id}::uuid`;
      e.venue = 'jupiter';
    }
    const amount = BigInt(e.amount_usd6);
    const mint = verifiedMint(e.asset_id, 'solana');
    if (!mint) throw new ApiError('NOTHING_TO_BUY', { reason: 'no_venue' });
    const have = await tokenBalanceRaw(user.solAddress!, SOL_USDC);
    if (have < amount) throw new ApiError('INSUFFICIENT_FREE', { availableUsd6: have.toString(), where: 'solana' });
    const dexes = dexesOfVenue(e.venue);
    const built = await buildUserSwap({ owner: user.solAddress!, inputMint: SOL_USDC, outputMint: mint.mint, amountRaw: amount, ownbackFee: true, ...(dexes ? { dexes } : {}) });
    // Stay `quoted` until the signed tx lands — `waiting` left entries stuck when Privy/sign failed mid-flight.
    await getSql()`UPDATE buy_entries SET status = 'quoted', swap_msg_hash = ${built.msgHash}, error = NULL,
      quote_price_usd6 = ${priceUsd6FromBuyQuote(amount, BigInt(built.quote.outAmount), mint.decimals).toString()}::bigint
      WHERE id = ${e.id}::uuid`;
    await getSql()`UPDATE buy_batches SET status = 'swapping', updated_at = now() WHERE id = ${b.id}::uuid`;
    return c.json({
      action: { kind: 'sol_tx' as const, txBase64: built.txBase64, feePayer: built.feePayer, summary: `Buy ${toUsd6(amount)} of ${mint.symbol}` },
      estQty: rawToQty(BigInt(built.quote.outAmount), mint.decimals),
      token: mint.symbol,
      route: routeExchanges(built.quote.routePlan),
    });
  } catch (err) {
    const msg = pipelineError(err);
    const batchId = c.req.param('batchId');
    const assetId = c.req.param('assetId');
    await getSql()`UPDATE buy_entries SET status = 'paused', error = ${msg}, swap_msg_hash = NULL
      WHERE batch_id = ${batchId}::uuid AND asset_id = ${assetId} AND status <> 'bought'`.catch(() => {});
    await getSql()`UPDATE buy_batches SET error = ${msg}, updated_at = now() WHERE id = ${batchId}::uuid`.catch(() => {});
    return jsonError(c, err);
  }
});

/** The user signed: send it, then book the real fill from the tx's token balances. */
jarsBuysRoutes.post('/buys/:batchId/swaps/:assetId/submit', async (c) => {
  const sql = getSql();
  let entryId: string | null = null;
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const { signedTx } = z.object({ signedTx: z.string().min(1) }).parse(await c.req.json());
    const b = await loadBatch(user, c.req.param('batchId'));
    const e = await loadEntry(b.id, c.req.param('assetId'));
    if (!e.swap_msg_hash || (e.status !== 'quoted' && e.status !== 'waiting')) {
      throw new ApiError('VALIDATION', { reason: 'not_ready_to_submit' });
    }
    entryId = e.id;
    const mint = verifiedMint(e.asset_id, 'solana')!;
    const sig = await submitSigned(signedTx, e.swap_msg_hash);
    await sql`UPDATE buy_entries SET status = 'sent', venue_tx = ${sig} WHERE id = ${e.id}::uuid`;
    const [outRaw, usdcDelta] = await Promise.all([
      tokenDeltaInTx(sig, user.solAddress!, mint.mint),
      tokenDeltaInTx(sig, user.solAddress!, SOL_USDC),
    ]);
    const spent = usdcDelta < 0n ? -usdcDelta : BigInt(e.amount_usd6);
    const qty = rawToQty(outRaw, mint.decimals);
    await sql`UPDATE buy_entries SET status = 'bought', spent_usd6 = ${spent.toString()}::bigint, qty = ${qty}::numeric,
      qty_raw = ${outRaw.toString()}, fill_price_usd6 = ${priceUsd6FromBuyQuote(spent, outRaw, mint.decimals).toString()}::bigint, error = NULL
      WHERE id = ${e.id}::uuid`;
    if (b.trigger !== 'market') await debitJars(user.id, e.asset_id, spent); // D35: market buys never touch jars
    await logEvent(user.id, 'buy_done', { amountUsd6: spent.toString(), assetId: e.asset_id, qty, token: mint.symbol, tx: sig }, `/holdings/${e.asset_id}`);
    const left = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM buy_entries WHERE batch_id = ${b.id}::uuid AND status <> 'bought'`;
    if (left[0]!.n === 0) {
      await sql`UPDATE buy_batches SET status = 'done', error = NULL, finished_at = now(), updated_at = now() WHERE id = ${b.id}::uuid`;
    } else {
      await sql`UPDATE buy_batches SET error = NULL, updated_at = now() WHERE id = ${b.id}::uuid`;
    }
    return c.json({ status: 'bought', venueTx: sig, explorerUrl: EXPLORER.solTx(sig), qty, spentUsd6: toUsd6(spent) });
  } catch (err) {
    if (entryId) {
      const msg = pipelineError(err);
      await sql`UPDATE buy_entries SET status = 'paused', error = ${msg}, swap_msg_hash = NULL WHERE id = ${entryId}::uuid AND status <> 'bought'`.catch(() => {});
      await sql`UPDATE buy_batches SET error = ${msg}, updated_at = now() WHERE id = ${c.req.param('batchId')}::uuid`.catch(() => {});
    }
    return jsonError(c, err instanceof z.ZodError ? new ApiError('VALIDATION', { issues: err.issues }) : err);
  }
});

/**
 * User-facing Retry: kick CCTP delivery, or reopen paused swaps.
 * Bridging with no Arc tx yet needs a fresh buy from review (nothing on-chain to resume).
 */
jarsBuysRoutes.post('/buys/:batchId/retry', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const b = await loadBatch(user, c.req.param('batchId'));
    const sql = getSql();

    if (b.status === 'done') throw new ApiError('VALIDATION', { reason: 'already_done' });

    if (b.status === 'bridging' && !b.arc_tx) {
      throw new ApiError('VALIDATION', { reason: 'needs_new_buy' });
    }

    if (b.status === 'bridging' && b.arc_tx) {
      await sql`UPDATE buy_batches SET status = 'attesting', error = NULL, updated_at = now() WHERE id = ${b.id}::uuid`;
      await advanceBatch(b.id);
      const [n] = await sql<{ status: string }[]>`SELECT status FROM buy_batches WHERE id = ${b.id}::uuid`;
      return c.json({ status: n?.status ?? 'attesting' });
    }

    if (b.status === 'attesting' || b.status === 'minting') {
      await sql`UPDATE buy_batches SET error = NULL, updated_at = now() WHERE id = ${b.id}::uuid`;
      await advanceBatch(b.id);
      const [n] = await sql<{ status: string }[]>`SELECT status FROM buy_batches WHERE id = ${b.id}::uuid`;
      return c.json({ status: n?.status ?? b.status });
    }

    if (b.status === 'swap_ready' || b.status === 'swapping' || b.status === 'failed' || b.status === 'done_partial') {
      await sql`UPDATE buy_entries SET status = 'quoted', error = NULL, swap_msg_hash = NULL
        WHERE batch_id = ${b.id}::uuid AND status IN ('paused', 'waiting', 'quoted', 'sent')`;
      await sql`UPDATE buy_batches SET status = 'swap_ready', error = NULL, updated_at = now() WHERE id = ${b.id}::uuid`;
      return c.json({ status: 'swap_ready' });
    }

    throw new ApiError('DEPOSIT_NOT_READY', { status: b.status });
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

/** Lets the PWA wait for each Arc call to land before sending the next (approve before deposit). */
jarsBuysRoutes.get('/chain/arc/tx/:hash', async (c) => {
  try {
    await requireUser(c);
    const hash = c.req.param('hash');
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new ApiError('VALIDATION');
    const r = await arcPublic().getTransactionReceipt({ hash: hash as `0x${string}` }).catch(() => null);
    return c.json({ status: !r ? 'pending' : r.status === 'success' ? 'success' : 'reverted', explorerUrl: EXPLORER.arcTx(hash) });
  } catch (e) {
    return jsonError(c, e);
  }
});

jarsBuysRoutes.get('/buys/:batchId', async (c) => {
  try {
    const user = await requireUser(c);
    const b = await loadBatch(user, c.req.param('batchId'));
    if (b.status === 'attesting' || b.status === 'minting') void advanceBatch(b.id);
    const entries = await getSql()<Entry[]>`SELECT * FROM buy_entries WHERE batch_id = ${b.id}::uuid ORDER BY item_index`;
    const bought = entries
      .filter((e) => e.status === 'bought')
      .reduce((s, e) => s + BigInt(e.spent_usd6 ?? e.amount_usd6 ?? 0), 0n);
    return c.json({
      batchId: b.id,
      status: b.status,
      trigger: b.trigger,
      startedAt: (b.started_at ?? new Date()).toISOString(),
      totalUsd6: toUsd6(b.total_usd6 ?? 0),
      bridgeUsd6: toUsd6(b.bridge_usd6 ?? 0),
      ...(b.error ? { error: b.error } : {}),
      links: {
        ...(b.arc_tx ? { arc: EXPLORER.arcTx(b.arc_tx) } : {}),
        ...(b.mint_tx ? { mint: EXPLORER.solTx(b.mint_tx) } : {}),
      },
      entries: entries.map((e) => {
        const mint = verifiedMint(e.asset_id, 'solana');
        return {
          assetId: e.asset_id,
          name: assetDisplayName(e.asset_id),
          ...iconField(e.asset_id),
          ...(mint ? { token: mint.symbol } : {}),
          status: e.status,
          amountUsd6: toUsd6(e.amount_usd6 ?? 0),
          ...(e.spent_usd6 != null ? { spentUsd6: toUsd6(e.spent_usd6) } : {}),
          ...(e.fill_price_usd6 != null ? { fillPriceUsd6: toUsd6(e.fill_price_usd6) } : {}),
          ...(e.qty ? { qty: String(e.qty).replace(/\.?0+$/, '') } : {}),
          ...(e.error ? { error: e.error } : {}),
          ...(e.venue_tx ? { venueTx: e.venue_tx, explorerUrl: EXPLORER.solTx(e.venue_tx) } : {}),
          // D47: the exchange the buyer held this token to; absent = best route over every exchange.
          ...(venueLabel(e.venue) ? { exchange: venueLabel(e.venue) } : {}),
        };
      }),
      boughtUsd6: toUsd6(bought),
      destination: user.solAddress ?? '',
    });
  } catch (e) {
    return jsonError(c, e);
  }
});
