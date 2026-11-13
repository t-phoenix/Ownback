/**
 * Sell verified Solana tokens → USDC in the user's own Solana wallet (D31), and "Move to Arc"
 * (Solana USDC → CCTP → the user's Arc wallet). The user signs; the relay only pays SOL.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { getSql } from '../db/client.js';
import { ApiError } from '../shared/errors.js';
import { toUsd6 } from '../shared/money.js';
import { EXPLORER, USDC } from '../shared/chains.js';
import { buildFees } from '../lib/fees.js';
import { mockChain } from '../lib/env.js';
import { jsonError, requireCsrf, requireUser } from '../lib/http.js';
import { newId } from '../lib/ids.js';
import { assetDisplayName } from '../lib/asset-name.js';
import { iconField, verifiedMint } from '../shared/assets.js';
import { jupiterPriceUsd6, jupiterSellQuote, rawToQty, routeFeeUsd6, sellSwapCostUsd6, sizeSellForUsd6, valueUsd6 } from '../lib/jupiter-price.js';
import { buildUserSwap, submitSigned, tokenBalanceRaw, tokenDeltaInTx } from '../lib/jupiter-swap.js';
import { buildSolanaBurnToArc } from '../lib/cctp.js';
import { advanceMove, logEvent } from '../lib/buy-pipeline.js';
import { qtyToRaw } from '../lib/qty.js';

export const sellsRoutes = new Hono();
const SOL_USDC = USDC.solana.value;

type User = Awaited<ReturnType<typeof requireUser>>;

/** What the user holds right now. On-chain in real mode; the book (buys − sells) under MOCK_CHAIN. */
export async function heldRaw(user: User, assetId: string): Promise<bigint> {
  const mint = verifiedMint(assetId, 'solana');
  if (!mint) return 0n;
  if (!mockChain()) return user.solAddress ? tokenBalanceRaw(user.solAddress, mint.mint) : 0n;
  const sql = getSql();
  const [b] = await sql<{ q: string }[]>`SELECT COALESCE(SUM(qty), 0)::text AS q FROM buy_entries WHERE user_id = ${user.id}::uuid AND asset_id = ${assetId} AND status = 'bought'`;
  const [s] = await sql<{ q: string }[]>`SELECT COALESCE(SUM(qty::numeric), 0)::text AS q FROM sells WHERE user_id = ${user.id}::uuid AND asset_id = ${assetId} AND status = 'done'`;
  const raw = (qtyToRaw(b!.q, mint.decimals) ?? 0n) - (qtyToRaw(s!.q, mint.decimals) ?? 0n);
  return raw > 0n ? raw : 0n;
}

type SellSize = { qty?: string; usd6?: string; pct?: string };

/** Raw amount to sell from qty, a dollar amount (at `priceUsd6`, floored, capped at held) or a percent. Pure; exported for tests. */
export function pickAmount(held: bigint, size: SellSize | string | undefined, decimals: number, priceUsd6: bigint | null = null): bigint {
  const s: SellSize = typeof size === 'string' ? { qty: size } : size ?? {};
  if (s.pct) {
    const p = Number(s.pct);
    if (![25, 50, 75, 100].includes(p)) throw new ApiError('VALIDATION', { issues: [{ path: ['pct'], message: 'invalid' }] });
    const raw = (held * BigInt(p)) / 100n;
    if (raw <= 0n) throw new ApiError('VALIDATION', { issues: [{ path: ['pct'], message: 'too_small' }] });
    return raw;
  }
  if (s.usd6) {
    if (!/^\d+$/.test(s.usd6) || !priceUsd6 || priceUsd6 <= 0n) throw new ApiError('VALIDATION', { issues: [{ path: ['usd6'], message: 'invalid' }] });
    const raw = (BigInt(s.usd6) * 10n ** BigInt(decimals)) / priceUsd6;
    if (raw <= 0n) throw new ApiError('VALIDATION', { issues: [{ path: ['usd6'], message: 'too_small' }] });
    return raw > held ? held : raw;
  }
  if (!s.qty) return held;
  const asked = qtyToRaw(s.qty, decimals);
  if (asked == null || asked <= 0n || asked > held) throw new ApiError('VALIDATION', { issues: [{ path: ['qty'], message: 'invalid' }] });
  return asked;
}

/** Average cost per whole token from the user's bought entries (Usd6), or 0 when unknown. */
async function avgCostUsd6(userId: string, assetId: string, decimals: number): Promise<bigint> {
  const rows = await getSql()<{ spent: string | null; qty: string | null }[]>`
    SELECT spent_usd6::text AS spent, qty::text AS qty FROM buy_entries WHERE user_id = ${userId}::uuid AND asset_id = ${assetId} AND status = 'bought'`;
  let paid = 0n; let raw = 0n;
  for (const r of rows) { paid += BigInt(r.spent ?? '0'); raw += r.qty ? qtyToRaw(r.qty, decimals) ?? 0n : 0n; }
  return raw > 0n ? (paid * 10n ** BigInt(decimals)) / raw : 0n;
}

sellsRoutes.get('/sells/review', async (c) => {
  try {
    const user = await requireUser(c);
    const assetId = c.req.query('assetId') ?? '';
    const mint = verifiedMint(assetId, 'solana');
    if (!mint) throw new ApiError('FEATURE_OFF');
    // Speed: everything that doesn't need the sell size starts at once; only the swap quote waits for it.
    const priceP = jupiterPriceUsd6(mint.mint);
    const avgP = avgCostUsd6(user.id, assetId, mint.decimals);
    const rulesP = getSql()<{ max_fee_bps: number }[]>`SELECT max_fee_bps FROM rules WHERE user_id = ${user.id}::uuid`;
    for (const p of [priceP, avgP, rulesP]) p.catch(() => {}); // awaited below
    const [held, sized] = await Promise.all([heldRaw(user, assetId), c.req.query('usd6') ? priceP : null]);
    if (held <= 0n) throw new ApiError('NOT_FOUND', { reason: 'nothing_held' });
    let amountRaw = pickAmount(held, { qty: c.req.query('qty'), usd6: c.req.query('usd6'), pct: c.req.query('pct') }, mint.decimals, sized);
    // By dollars: the reference price can lag the pool, so size from what the pool actually pays (two quotes).
    const byUsd = c.req.query('usd6') ? await sizeSellForUsd6(mint.mint, BigInt(c.req.query('usd6')!), held, mint.decimals, sized) : null;
    if (byUsd) amountRaw = byUsd.amountRaw;
    const [quote, oracle, avg, [r]] = await Promise.all([byUsd?.quote ?? jupiterSellQuote(mint.mint, amountRaw), priceP, avgP, rulesP]);
    if (!quote) throw new ApiError('UPSTREAM', { reason: 'no_route' });
    const outUsd6 = BigInt(quote.outAmount); // USDC raw === Usd6
    // Measured round trip first (docs/05); the reference-price gap only when the reverse quote fails.
    const fee = (await sellSwapCostUsd6(mint.mint, amountRaw, outUsd6)) ?? (oracle ? routeFeeUsd6(valueUsd6(amountRaw, mint.decimals, oracle), outUsd6) : 0n);
    const cost = valueUsd6(amountRaw, mint.decimals, avg);
    return c.json({
      assetId,
      name: assetDisplayName(assetId),
      ...iconField(assetId),
      token: mint.symbol,
      mint: mint.mint,
      decimals: mint.decimals,
      heldQty: rawToQty(held, mint.decimals),
      qty: rawToQty(amountRaw, mint.decimals),
      amountRaw: amountRaw.toString(),
      estUsdcUsd6: toUsd6(outUsd6),
      // Worst case after slippage protection: the swap fails rather than pay less.
      minUsdcUsd6: toUsd6(BigInt(quote.otherAmountThreshold)),
      priceUsd6: toUsd6(oracle ?? 0n),
      // What this sell actually gets per whole token.
      execPriceUsd6: toUsd6((outUsd6 * 10n ** BigInt(mint.decimals)) / amountRaw),
      request: { qty: c.req.query('qty') ?? null, usd6: c.req.query('usd6') ?? null, pct: c.req.query('pct') ?? null },
      network: { solanaPaidBy: 'ownback' as const },
      fees: buildFees([{ label: 'Jupiter route', usd6: fee }], outUsd6 > 0n ? outUsd6 : 1n, r?.max_fee_bps ?? 500, false),
      ...(avg > 0n ? { costBasisUsd6: toUsd6(cost), pnlUsd6: (outUsd6 - cost).toString() } : {}),
      destination: user.solAddress ?? '',
    });
  } catch (e) {
    return jsonError(c, e);
  }
});

/** Builds the sell swap (relay-signed as fee payer). The PWA has the user sign, then calls /submit. */
sellsRoutes.post('/sells', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const body = z.object({ assetId: z.string().min(1), qty: z.string().optional(), source: z.enum(['holding', 'market']).default('holding') }).parse(await c.req.json());
    const mint = verifiedMint(body.assetId, 'solana');
    if (!mint) throw new ApiError('FEATURE_OFF');
    const held = await heldRaw(user, body.assetId);
    if (held <= 0n) throw new ApiError('NOT_FOUND', { reason: 'nothing_held' });
    const amountRaw = pickAmount(held, body.qty, mint.decimals);
    const qty = rawToQty(amountRaw, mint.decimals);
    const sellId = newId();
    const sql = getSql();
    const cost = valueUsd6(amountRaw, mint.decimals, await avgCostUsd6(user.id, body.assetId, mint.decimals));
    if (mockChain()) {
      const q = await jupiterSellQuote(mint.mint, amountRaw);
      await sql`INSERT INTO sells (id, user_id, asset_id, status, amount_raw, qty, received_usd6, source, cost_basis_usd6, created_at, finished_at)
        VALUES (${sellId}::uuid, ${user.id}::uuid, ${body.assetId}, 'done', ${amountRaw.toString()}, ${qty}, ${q?.outAmount ?? '0'}::bigint, ${body.source}, ${cost.toString()}::bigint, now(), now())`;
      await logEvent(user.id, 'sell_done', { amountUsd6: q?.outAmount ?? '0', assetId: body.assetId }, `/holdings/${body.assetId}`);
      return c.json({ sellId });
    }
    if (!user.solAddress) throw new ApiError('NO_SOLANA_RECIPIENT', { reason: 'no_solana_wallet' });
    const built = await buildUserSwap({ owner: user.solAddress, inputMint: mint.mint, outputMint: SOL_USDC, amountRaw });
    await sql`INSERT INTO sells (id, user_id, asset_id, status, amount_raw, qty, swap_msg_hash, source, cost_basis_usd6, created_at)
      VALUES (${sellId}::uuid, ${user.id}::uuid, ${body.assetId}, 'signing', ${amountRaw.toString()}, ${qty}, ${built.msgHash}, ${body.source}, ${cost.toString()}::bigint, now())`;
    return c.json({
      sellId,
      estUsdcUsd6: toUsd6(BigInt(built.quote.outAmount)),
      action: { kind: 'sol_tx' as const, txBase64: built.txBase64, feePayer: built.feePayer, summary: `Sell ${qty} ${mint.symbol} for USDC` },
    });
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

sellsRoutes.post('/sells/:sellId/submit', async (c) => {
  const sql = getSql();
  let sellId: string | null = null;
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const { signedTx } = z.object({ signedTx: z.string().min(1) }).parse(await c.req.json());
    const [s] = await sql<{ id: string; asset_id: string; status: string; swap_msg_hash: string | null }[]>`
      SELECT id, asset_id, status, swap_msg_hash FROM sells WHERE id = ${c.req.param('sellId')}::uuid AND user_id = ${user.id}::uuid`;
    if (!s) throw new ApiError('NOT_FOUND');
    if (s.status !== 'signing' || !s.swap_msg_hash) throw new ApiError('VALIDATION', { reason: 'not_signing' });
    sellId = s.id;
    await sql`UPDATE sells SET status = 'sent' WHERE id = ${s.id}::uuid`;
    const sig = await submitSigned(signedTx, s.swap_msg_hash);
    const received = await tokenDeltaInTx(sig, user.solAddress!, SOL_USDC);
    await sql`UPDATE sells SET status = 'done', venue_tx = ${sig}, received_usd6 = ${received.toString()}::bigint, finished_at = now() WHERE id = ${s.id}::uuid`;
    await logEvent(user.id, 'sell_done', { amountUsd6: received.toString(), assetId: s.asset_id, tx: sig }, `/holdings/${s.asset_id}`);
    return c.json({ status: 'done', venueTx: sig, explorerUrl: EXPLORER.solTx(sig), receivedUsd6: toUsd6(received) });
  } catch (e) {
    if (sellId) {
      const msg = e instanceof ApiError ? e.code : (e as Error).message;
      await sql`UPDATE sells SET status = 'failed', error = ${msg.slice(0, 300)} WHERE id = ${sellId}::uuid AND status <> 'done'`.catch(() => {});
    }
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

sellsRoutes.get('/sells/:sellId', async (c) => {
  try {
    const user = await requireUser(c);
    const [s] = await getSql()<{ id: string; status: string; venue_tx: string | null; received_usd6: bigint | null; error: string | null; qty: string; asset_id: string }[]>`
      SELECT id, status, venue_tx, received_usd6, error, qty, asset_id FROM sells WHERE id = ${c.req.param('sellId')}::uuid AND user_id = ${user.id}::uuid`;
    if (!s) throw new ApiError('NOT_FOUND');
    return c.json({
      sellId: s.id,
      status: s.status,
      assetId: s.asset_id,
      qty: s.qty,
      ...(s.venue_tx ? { venueTx: s.venue_tx, explorerUrl: EXPLORER.solTx(s.venue_tx) } : {}),
      ...(s.received_usd6 != null ? { receivedUsd6: toUsd6(s.received_usd6) } : {}),
      ...(s.error ? { error: s.error } : {}),
    });
  } catch (e) {
    return jsonError(c, e);
  }
});

// ─── Move to Arc ─────────────────────────────────────────────────────────────

sellsRoutes.post('/moves/to-arc', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const { amountUsd6 } = z.object({ amountUsd6: z.string().regex(/^\d+$/) }).parse(await c.req.json());
    const amount = BigInt(amountUsd6);
    if (amount < 100_000n) throw new ApiError('VALIDATION', { issues: [{ path: ['amountUsd6'], message: 'min_0.10' }] });
    if (!user.solAddress || !user.evmAddress) throw new ApiError('NO_SOLANA_RECIPIENT');
    if (mockChain()) throw new ApiError('FEATURE_OFF');
    const have = await tokenBalanceRaw(user.solAddress, SOL_USDC);
    if (have < amount) throw new ApiError('INSUFFICIENT_FREE', { availableUsd6: have.toString(), where: 'solana' });
    const built = await buildSolanaBurnToArc(user.solAddress, user.evmAddress, amount);
    const id = newId();
    await getSql()`INSERT INTO withdrawals (id, user_id, chain, amount_usd6, status, swap_msg_hash, created_at)
      VALUES (${id}::uuid, ${user.id}::uuid, 'arc', ${amount.toString()}::bigint, 'signing', ${built.msgHash}, now())`;
    return c.json({ moveId: id, action: { kind: 'sol_tx' as const, txBase64: built.txBase64, feePayer: built.feePayer, summary: `Move ${toUsd6(amount)} USDC to your Arc wallet` } });
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

sellsRoutes.post('/moves/:id/submit', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const { signedTx } = z.object({ signedTx: z.string().min(1) }).parse(await c.req.json());
    const [m] = await getSql()<{ id: string; status: string; swap_msg_hash: string }[]>`
      SELECT id, status, swap_msg_hash FROM withdrawals WHERE id = ${c.req.param('id')}::uuid AND user_id = ${user.id}::uuid`;
    if (!m || m.status !== 'signing') throw new ApiError('NOT_FOUND');
    const sig = await submitSigned(signedTx, m.swap_msg_hash);
    await getSql()`UPDATE withdrawals SET sol_tx = ${sig}, status = 'attesting' WHERE id = ${m.id}::uuid`;
    void advanceMove(m.id);
    return c.json({ status: 'attesting', solTx: sig, explorerUrl: EXPLORER.solTx(sig) });
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

sellsRoutes.get('/moves/:id', async (c) => {
  try {
    const user = await requireUser(c);
    const [m] = await getSql()<{ id: string; status: string; amount_usd6: bigint; sol_tx: string | null; arc_tx: string | null; error: string | null }[]>`
      SELECT id, status, amount_usd6, sol_tx, arc_tx, error FROM withdrawals WHERE id = ${c.req.param('id')}::uuid AND user_id = ${user.id}::uuid`;
    if (!m) throw new ApiError('NOT_FOUND');
    if (m.status === 'attesting' || m.status === 'minting') void advanceMove(m.id);
    return c.json({
      moveId: m.id,
      status: m.status,
      amountUsd6: toUsd6(m.amount_usd6),
      links: { ...(m.sol_tx ? { sol: EXPLORER.solTx(m.sol_tx) } : {}), ...(m.arc_tx ? { arc: EXPLORER.arcTx(m.arc_tx) } : {}) },
      ...(m.error ? { error: m.error } : {}),
    });
  } catch (e) {
    return jsonError(c, e);
  }
});
