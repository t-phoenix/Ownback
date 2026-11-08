/**
 * Sell verified Solana RWAs → USDC into the user's wallet (Jupiter).
 * User signs the swap (token authority); relay may pay fees when configured.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { getSql } from '../db/client.js';
import { ApiError } from '../shared/errors.js';
import { toUsd6 } from '../shared/money.js';
import { QUOTE_REFRESH_MS } from '../shared/timing.js';
import { buildFees } from '../lib/fees.js';
import { mockChain } from '../lib/env.js';
import {
  assertIdempotencyKey,
  jsonError,
  requireCsrf,
  requireUser,
  withIdempotency,
} from '../lib/http.js';
import { newId } from '../lib/ids.js';
import { assetDisplayName } from '../lib/asset-name.js';
import { verifiedMint } from '../shared/assets.js';
import { feeFromImpact, jupiterSellQuote, rawToQty } from '../lib/jupiter-price.js';
import { buildSellSwapTx, relayConfigured } from '../lib/jupiter-swap.js';

export const sellsRoutes = new Hono();

function qtyToRaw(qty: string, decimals: number): bigint | null {
  if (!/^\d+(\.\d+)?$/.test(qty.trim())) return null;
  const [w, f = ''] = qty.trim().split('.');
  // Postgres numeric may return trailing zeros past mint decimals — truncate, don't reject.
  const frac = (f + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(w) * 10n ** BigInt(decimals) + BigInt(frac || '0');
}

function sumQty(rows: { qty: string | null }[], decimals: number): bigint {
  let total = 0n;
  for (const r of rows) {
    if (!r.qty) continue;
    const raw = qtyToRaw(r.qty, decimals);
    if (raw != null) total += raw;
  }
  return total;
}

sellsRoutes.get('/sells/review', async (c) => {
  try {
    const user = await requireUser(c);
    const assetId = c.req.query('assetId');
    if (!assetId) throw new ApiError('VALIDATION', { issues: [{ path: 'assetId', message: 'required' }] });
    const mint = verifiedMint(assetId, 'solana');
    if (!mint) throw new ApiError('FEATURE_OFF');
    const sql = getSql();
    const rows = await sql<{ qty: string | null; spent: bigint }[]>`
      SELECT qty::text AS qty, spent_usd6 AS spent FROM buy_entries
      WHERE user_id = ${user.id}::uuid AND asset_id = ${assetId} AND status = 'bought'
    `;
    if (!rows.length) throw new ApiError('NOT_FOUND');
    const held = sumQty(rows, mint.decimals);
    if (held <= 0n) throw new ApiError('NOT_FOUND');
    const qtyParam = c.req.query('qty');
    let amountRaw = held;
    if (qtyParam) {
      const asked = qtyToRaw(qtyParam, mint.decimals);
      if (asked == null || asked <= 0n || asked > held) throw new ApiError('VALIDATION', { issues: [{ path: 'qty', message: 'invalid' }] });
      amountRaw = asked;
    }
    const quote = await jupiterSellQuote(mint.mint, amountRaw);
    if (!quote && !mockChain()) throw new ApiError('UPSTREAM');
    const outUsd6 = quote ? BigInt(quote.outAmount) : 0n; // USDC raw = Usd6
    const fee = quote ? feeFromImpact(outUsd6 > 0n ? outUsd6 : 1n, quote.priceImpactPct) : 0n;
    const rules = await sql<{ max_fee_bps: number }[]>`SELECT max_fee_bps FROM rules WHERE user_id = ${user.id}::uuid`;
    const maxFeeBps = rules[0]?.max_fee_bps ?? 500;
    const fees = buildFees([{ label: 'Jupiter route', usd6: fee }], outUsd6 > 0n ? outUsd6 : 1n, maxFeeBps, false);

    let action:
      | { kind: 'sol_tx'; txBase64: string; feePayer: string; summary: string }
      | { kind: 'typed_data'; typedData: unknown; summary: string };
    if (mockChain() || !user.solAddress) {
      action = {
        kind: 'typed_data',
        typedData: { domain: { name: 'OwnbackSell' }, types: { Sell: [{ name: 'asset', type: 'string' }] }, primaryType: 'Sell', message: { asset: assetId } },
        summary: `Sell ${rawToQty(amountRaw, mint.decimals)} ${mint.symbol}`,
      };
    } else {
      const built = await buildSellSwapTx({
        userSolAddress: user.solAddress,
        mint: mint.mint,
        amountRaw,
      });
      if (!built) throw new ApiError('UPSTREAM');
      action = {
        kind: 'sol_tx',
        txBase64: built.swapTransaction,
        feePayer: relayConfigured() ? (process.env.RELAY_SOL_ADDRESS || user.solAddress) : user.solAddress,
        summary: `Sell ${rawToQty(amountRaw, mint.decimals)} ${mint.symbol} for USDC`,
      };
    }

    const quoteId = newId();
    const expiresAt = new Date(Date.now() + QUOTE_REFRESH_MS);
    const payload = {
      assetId,
      mint: mint.mint,
      decimals: mint.decimals,
      amountRaw: amountRaw.toString(),
      qty: rawToQty(amountRaw, mint.decimals),
      estUsdcUsd6: toUsd6(outUsd6),
      action,
    };
    await sql`
      INSERT INTO quotes (id, user_id, payload, expires_at)
      VALUES (${quoteId}::uuid, ${user.id}::uuid, ${sql.json(payload as never)}, ${expiresAt})
    `;
    return c.json({
      quoteId,
      expiresAt: expiresAt.toISOString(),
      assetId,
      name: assetDisplayName(assetId),
      token: mint.symbol,
      mint: mint.mint,
      decimals: mint.decimals,
      qty: payload.qty,
      amountRaw: payload.amountRaw,
      estUsdcUsd6: payload.estUsdcUsd6,
      fees,
      destination: user.solAddress ?? '',
      action,
    });
  } catch (e) {
    return jsonError(c, e);
  }
});

sellsRoutes.post('/sells', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const key = assertIdempotencyKey(c);
    const body = z
      .object({ quoteId: z.string().uuid(), txHash: z.string().optional() })
      .parse(await c.req.json());
    const hash = body.quoteId + (body.txHash ?? '');
    const out = await withIdempotency(user.id, key, hash, async () => {
      const sql = getSql();
      const q = await sql<{ payload: unknown; expires_at: Date }[]>`
        SELECT payload, expires_at FROM quotes WHERE id = ${body.quoteId}::uuid AND user_id = ${user.id}::uuid
      `;
      if (!q[0]) throw new ApiError('NOT_FOUND');
      if (q[0].expires_at.getTime() < Date.now()) throw new ApiError('QUOTE_EXPIRED');
      const payload = q[0].payload as {
        assetId: string;
        amountRaw: string;
        qty: string;
        estUsdcUsd6: string;
        mint: string;
        decimals: number;
      };
      const sellId = newId();
      const venueTx = body.txHash ?? (mockChain() ? 'mock' : undefined);
      if (!venueTx) throw new ApiError('BAD_SIGNATURE');
      await sql`
        INSERT INTO sells (id, user_id, asset_id, status, amount_raw, qty, received_usd6, venue_tx, quote_id, created_at, finished_at)
        VALUES (
          ${sellId}::uuid, ${user.id}::uuid, ${payload.assetId}, 'done',
          ${payload.amountRaw}, ${payload.qty}, ${payload.estUsdcUsd6}::bigint,
          ${venueTx}, ${body.quoteId}::uuid, now(), now()
        )
      `;
      // Reduce holdings book: mark bought entries returned proportionally by zeroing spent when fully sold (MVP: mark latest as sold via spent=0 + status pause).
      // shortcut: bookkeeping clears qty on bought rows for this asset when mock/full sell; upgrade to lot matching later.
      if (mockChain()) {
        await sql`
          UPDATE buy_entries SET status = 'returned', spent_usd6 = 0
          WHERE user_id = ${user.id}::uuid AND asset_id = ${payload.assetId} AND status = 'bought'
        `;
      }
      return { sellId };
    });
    return c.json(out);
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

sellsRoutes.get('/sells/:sellId', async (c) => {
  try {
    const user = await requireUser(c);
    const sql = getSql();
    const rows = await sql<
      { id: string; status: string; venue_tx: string | null; received_usd6: bigint | null }[]
    >`
      SELECT id, status, venue_tx, received_usd6 FROM sells
      WHERE id = ${c.req.param('sellId')}::uuid AND user_id = ${user.id}::uuid
    `;
    const s = rows[0];
    if (!s) throw new ApiError('NOT_FOUND');
    return c.json({
      sellId: s.id,
      status: s.status,
      ...(s.venue_tx
        ? {
            venueTx: s.venue_tx,
            explorerUrl: s.venue_tx === 'mock' ? undefined : `https://solscan.io/tx/${s.venue_tx}`,
          }
        : {}),
      ...(s.received_usd6 != null ? { receivedUsd6: toUsd6(s.received_usd6) } : {}),
    });
  } catch (e) {
    return jsonError(c, e);
  }
});
