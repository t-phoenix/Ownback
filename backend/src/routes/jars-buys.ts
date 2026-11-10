import { assetDisplayName } from '../lib/asset-name.js';
import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getSql } from '../db/client.js';
import { ApiError } from '../shared/errors.js';
import { asUsd6, toUsd6 } from '../shared/money.js';
import { CENT_USD6, QUOTE_REFRESH_MS } from '../shared/timing.js';
import { EXPLORER, USDC } from '../shared/chains.js';
import { buildFees, feeWithinCap } from '../lib/fees.js';
import { jarState } from '../lib/limits.js';
import { mockChain } from '../lib/env.js';
import { assertIdempotencyKey, jsonError, mockEvmAction, requireCsrf, requireUser, withIdempotency } from '../lib/http.js';
import { newId } from '../lib/ids.js';
import { readAssetFromArkiv } from '../lib/arkiv/read-asset.js';
import { iconField, verifiedMint } from '../shared/assets.js';
import { jupiterBuyQuote, jupiterPriceUsd6, priceUsd6FromBuyQuote, rawToQty, routeFeeUsd6, valueUsd6 } from '../lib/jupiter-price.js';
import { buildUserSwap, relayConfigured, submitSigned, tokenBalanceRaw, tokenDeltaInTx } from '../lib/jupiter-swap.js';
import {
  advanceBatch,
  arcBridgeCalls,
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
    const jars = await Promise.all(rows.map(async (r) => {
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

async function buildBuyReview(user: User, include: 'all' | 'ready', amounts: Map<string, bigint>) {
  const sql = getSql();
  const rules = await sql<{ ready_min_usd6: bigint | string; max_fee_bps: number | string }[]>`
    SELECT ready_min_usd6, max_fee_bps FROM rules WHERE user_id = ${user.id}::uuid
  `;
  if (!rules[0]) throw new ApiError('VALIDATION', { reason: 'no_rules' });
  const readyMin = BigInt(rules[0].ready_min_usd6);
  const maxFeeBps = Number(rules[0].max_fee_bps);
  const jarRows = await sql<{ asset_id: string; amt: bigint | string }[]>`
    SELECT a.asset_id, COALESCE(SUM(a.saved_usd6 - a.bought_usd6), 0) AS amt
    FROM allocations a JOIN purchases p ON p.id = a.purchase_id
    WHERE p.user_id = ${user.id}::uuid AND p.status = 'saved' AND a.selected = true
    GROUP BY a.asset_id
    HAVING COALESCE(SUM(a.saved_usd6 - a.bought_usd6), 0) > 0
  `;
  const jars = new Map(jarRows.map((r) => [r.asset_id, BigInt(r.amt)]));
  // Typed amounts scope the review to those assets only (one jar tap → one row). Empty amounts = all ready / all jars.
  const ids =
    amounts.size > 0
      ? [...new Set([...amounts.keys()].filter((k) => jars.has(k) || Boolean(verifiedMint(k, 'solana'))))]
      : jarRows
          .filter((r) => include === 'all' || jarState(BigInt(r.amt), readyMin) === 'ready')
          .map((r) => r.asset_id);
  if (!ids.length) throw new ApiError('NO_READY_JARS');

  const now = new Date().toISOString();
  const rows = await Promise.all(
    ids.map(async (assetId) => {
      const jarAmt = asUsd6(jars.get(assetId) ?? 0n);
      const spend = asUsd6(amounts.get(assetId) ?? jarAmt);
      const mint = verifiedMint(assetId, 'solana');
      const [quote, oracle, arkiv] = await Promise.all([
        mint ? jupiterBuyQuote(mint.mint, spend) : null,
        mint ? jupiterPriceUsd6(mint.mint) : null,
        readAssetFromArkiv(assetId, 'solana').catch(() => null),
      ]);
      const outRaw = quote ? BigInt(quote.outAmount) : 0n;
      const priceUsd6 = mint && outRaw > 0n ? priceUsd6FromBuyQuote(spend, outRaw, mint.decimals) : 0n;
      const fee = mint && oracle ? routeFeeUsd6(spend, valueUsd6(outRaw, mint.decimals, asUsd6(oracle))) : 0n;
      const fees = buildFees([{ label: 'Jupiter route', usd6: fee }], spend, maxFeeBps, false);
      const selectable = Boolean(mint) && outRaw > 0n && feeWithinCap(fee, spend, maxFeeBps);
      return {
        assetId,
        name: assetDisplayName(assetId),
        ...iconField(assetId),
        amountUsd6: toUsd6(spend),
        jarAmountUsd6: toUsd6(jarAmt),
        suggestedUsd6: toUsd6(jarAmt),
        ...(mint ? { token: mint.symbol, mint: mint.mint, decimals: mint.decimals, issuer: mint.issuer } : {}),
        chain: 'solana' as const,
        venue: 'jupiter' as const,
        price: { usd6PerUnit: toUsd6(priceUsd6), at: now, source: 'jupiter' as const },
        refPriceUsd6: toUsd6(oracle ?? 0n),
        estQty: mint && outRaw > 0n ? rawToQty(outRaw, mint.decimals) : '0',
        fees,
        selectable,
        ...(selectable ? {} : { reason: (mint ? 'fees_high' : 'no_venue') as 'fees_high' | 'no_venue' }),
        ...(arkiv ? { arkiv } : {}),
      };
    }),
  );

  const picked = rows.filter((r) => r.selectable);
  const total = picked.reduce((a, r) => a + BigInt(r.amountUsd6), 0n);
  const totalFee = picked.reduce((a, r) => a + BigInt(r.fees.totalUsd6), 0n);
  const [onSolana, onArc] = await Promise.all([
    solUsdc(user),
    !mockChain() && user.evmAddress ? arcUsdcBalance(user.evmAddress).catch(() => 0n) : Promise.resolve(0n),
  ]);
  const bridge = total > onSolana ? total - onSolana : 0n;
  const quoteId = newId();
  const expiresAt = new Date(Date.now() + QUOTE_REFRESH_MS).toISOString();
  await sql`
    INSERT INTO quotes (id, user_id, payload, expires_at)
    VALUES (${quoteId}::uuid, ${user.id}::uuid, ${sql.json({ rows: picked.map((r) => ({ assetId: r.assetId, amountUsd6: r.amountUsd6 })), totalUsd6: total.toString() } as never)}, ${new Date(expiresAt)})
  `;
  return {
    quoteId,
    expiresAt,
    rows,
    totalUsd6: toUsd6(total),
    fees: buildFees([{ label: 'Jupiter route', usd6: totalFee }], total > 0n ? total : 1n, maxFeeBps, false),
    funding: { solanaUsdc6: toUsd6(onSolana), arcUsdc6: toUsd6(onArc), bridgeUsd6: toUsd6(bridge) },
    destination: user.solAddress ?? '',
  };
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
    const body = z.object({ quoteId: z.string().uuid() }).parse(await c.req.json());
    const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const out = await withIdempotency(user.id, key, hash, async () => {
      const sql = getSql();
      const q = await sql<{ payload: { rows: { assetId: string; amountUsd6: string }[]; totalUsd6: string }; expires_at: Date }[]>`
        SELECT payload, expires_at FROM quotes WHERE id = ${body.quoteId}::uuid AND user_id = ${user.id}::uuid
      `;
      if (!q[0]) throw new ApiError('NOT_FOUND');
      if (q[0].expires_at.getTime() < Date.now()) throw new ApiError('QUOTE_EXPIRED');
      const rows = q[0].payload.rows.filter((r) => BigInt(r.amountUsd6) > 0n);
      if (!rows.length) throw new ApiError('NOTHING_TO_BUY');
      const total = rows.reduce((s, r) => s + BigInt(r.amountUsd6), 0n);
      const batchId = newId();

      if (mockChain()) {
        await sql`INSERT INTO buy_batches (id, trigger, user_id, domain, status, total_usd6, started_at) VALUES (${batchId}::uuid, 'user', ${user.id}::uuid, 5, 'done', ${total.toString()}::bigint, now())`;
        for (const r of rows) {
          const mint = verifiedMint(r.assetId, 'solana');
          const quote = mint ? await jupiterBuyQuote(mint.mint, BigInt(r.amountUsd6)) : null;
          const qty = mint && quote ? rawToQty(BigInt(quote.outAmount), mint.decimals) : '0';
          await sql`INSERT INTO buy_entries (id, batch_id, user_id, asset_id, status, amount_usd6, spent_usd6, item_index, venue, qty)
            VALUES (${newId()}::uuid, ${batchId}::uuid, ${user.id}::uuid, ${r.assetId}, 'bought', ${r.amountUsd6}::bigint, ${r.amountUsd6}::bigint, 0, 'jupiter', ${qty}::numeric)`;
          await debitJars(user.id, r.assetId, BigInt(r.amountUsd6));
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
        VALUES (${batchId}::uuid, 'user', ${user.id}::uuid, 5, ${bridge > 0n ? 'bridging' : 'swap_ready'}, ${total.toString()}::bigint, ${bridge.toString()}::bigint, now())
      `;
      let i = 0;
      for (const r of rows) {
        await sql`INSERT INTO buy_entries (id, batch_id, user_id, asset_id, status, amount_usd6, item_index, venue)
          VALUES (${newId()}::uuid, ${batchId}::uuid, ${user.id}::uuid, ${r.assetId}, 'quoted', ${r.amountUsd6}::bigint, ${i++}, 'jupiter')`;
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

type Batch = { id: string; user_id: string; status: string; bridge_usd6: bigint; arc_tx: string | null; mint_tx: string | null; total_usd6: bigint; error: string | null; started_at: Date | null };

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

type Entry = { id: string; asset_id: string; status: string; amount_usd6: bigint; spent_usd6: bigint | null; fill_price_usd6: bigint | null; qty: string | null; venue_tx: string | null; error: string | null; swap_msg_hash: string | null };

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
    const mint = verifiedMint(e.asset_id, 'solana');
    if (!mint) throw new ApiError('NOTHING_TO_BUY', { reason: 'no_venue' });
    const amount = BigInt(e.amount_usd6);
    const have = await tokenBalanceRaw(user.solAddress!, SOL_USDC);
    if (have < amount) throw new ApiError('INSUFFICIENT_FREE', { availableUsd6: have.toString(), where: 'solana' });
    const built = await buildUserSwap({ owner: user.solAddress!, inputMint: SOL_USDC, outputMint: mint.mint, amountRaw: amount });
    // Stay `quoted` until the signed tx lands — `waiting` left entries stuck when Privy/sign failed mid-flight.
    await getSql()`UPDATE buy_entries SET status = 'quoted', swap_msg_hash = ${built.msgHash}, error = NULL,
      quote_price_usd6 = ${priceUsd6FromBuyQuote(amount, BigInt(built.quote.outAmount), mint.decimals).toString()}::bigint
      WHERE id = ${e.id}::uuid`;
    await getSql()`UPDATE buy_batches SET status = 'swapping', updated_at = now() WHERE id = ${b.id}::uuid`;
    return c.json({
      action: { kind: 'sol_tx' as const, txBase64: built.txBase64, feePayer: built.feePayer, summary: `Buy ${toUsd6(amount)} of ${mint.symbol}` },
      estQty: rawToQty(BigInt(built.quote.outAmount), mint.decimals),
      token: mint.symbol,
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
    await debitJars(user.id, e.asset_id, spent);
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
        };
      }),
      boughtUsd6: toUsd6(bought),
      destination: user.solAddress ?? '',
    });
  } catch (e) {
    return jsonError(c, e);
  }
});
