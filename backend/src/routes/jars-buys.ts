import { assetDisplayName } from '../lib/asset-name.js';
import { Hono } from 'hono';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getSql } from '../db/client.js';
import { ApiError } from '../shared/errors.js';
import { toUsd6 } from '../shared/money.js';
import { APPROVAL_TTL_MS, QUOTE_REFRESH_MS } from '../shared/timing.js';
import { buildFees, feeWithinCap, maxFeeUsd6 } from '../lib/fees.js';
import { jarState } from '../lib/limits.js';
import { envFlag, mockChain } from '../lib/env.js';
import {
  assertIdempotencyKey,
  jsonError,
  mockEvmAction,
  requireCsrf,
  requireUser,
  withIdempotency,
} from '../lib/http.js';
import { newId } from '../lib/ids.js';
import { ARC_CHAIN_ID } from '../shared/chains.js';

export const jarsBuysRoutes = new Hono();

jarsBuysRoutes.get('/jars', async (c) => {
  try {
    const user = await requireUser(c);
    const sql = getSql();
    const rules = await sql<{ ready_min_usd6: bigint; max_fee_bps: number }[]>`
      SELECT ready_min_usd6, max_fee_bps FROM rules WHERE user_id = ${user.id}::uuid
    `;
    const readyMin = rules[0]?.ready_min_usd6 ?? 5_000_000n;
    const rows = await sql<{ asset_id: string; amt: bigint; role: string }[]>`
      SELECT a.asset_id, a.role, COALESCE(SUM(a.saved_usd6 - a.bought_usd6), 0) AS amt
      FROM allocations a
      JOIN purchases p ON p.id = a.purchase_id
      WHERE p.user_id = ${user.id}::uuid AND p.status = 'saved' AND a.selected = true
      GROUP BY a.asset_id, a.role
      HAVING COALESCE(SUM(a.saved_usd6 - a.bought_usd6), 0) > 0
    `;
    const jars = rows.map((r) => ({
      assetId: r.asset_id,
      name: assetDisplayName(r.asset_id),
      role: r.role,
      amountUsd6: toUsd6(r.amt),
      readyMinUsd6: toUsd6(readyMin),
      state: jarState(r.amt, readyMin),
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

jarsBuysRoutes.get('/buys/review', async (c) => {
  try {
    const user = await requireUser(c);
    const include = c.req.query('include') === 'all' ? 'all' : 'ready';
    const sql = getSql();
    const rules = await sql<{ ready_min_usd6: bigint; max_fee_bps: number }[]>`
      SELECT ready_min_usd6, max_fee_bps FROM rules WHERE user_id = ${user.id}::uuid
    `;
    const readyMin = rules[0]!.ready_min_usd6;
    const maxFeeBps = rules[0]!.max_fee_bps;
    const rows = await sql<{ asset_id: string; amt: bigint }[]>`
      SELECT a.asset_id, COALESCE(SUM(a.saved_usd6 - a.bought_usd6), 0) AS amt
      FROM allocations a JOIN purchases p ON p.id = a.purchase_id
      WHERE p.user_id = ${user.id}::uuid AND p.status = 'saved'
      GROUP BY a.asset_id
      HAVING COALESCE(SUM(a.saved_usd6 - a.bought_usd6), 0) > 0
    `;
    const filtered = rows.filter((r) => include === 'all' || jarState(r.amt, readyMin) === 'ready');
    if (!filtered.length) throw new ApiError('NO_READY_JARS');

    // Venue quotes need Jupiter/etc. MOCK_CHAIN: zero fee, venue jupiter, no live prices invented as verified.
    const quoteId = newId();
    const expiresAt = new Date(Date.now() + QUOTE_REFRESH_MS).toISOString();
    const reviewRows = filtered.map((r) => {
      const fee = 0n;
      const fees = buildFees([{ label: 'Jupiter route', usd6: fee }], r.amt, maxFeeBps, false);
      const selectable = feeWithinCap(fee, r.amt, maxFeeBps) && mockChain();
      return {
        assetId: r.asset_id,
        name: assetDisplayName(r.asset_id),
        amountUsd6: toUsd6(r.amt),
        token: undefined as string | undefined,
        chain: 'solana' as const,
        venue: 'jupiter' as const,
        price: { usd6PerUnit: '0', at: new Date().toISOString(), source: 'jupiter' as const },
        refPriceUsd6: '0',
        estQty: '0',
        maxPriceUsd6: '0',
        fees,
        selectable,
        ...(selectable ? {} : { reason: 'no_venue' as const }),
      };
    });
    const total = filtered.reduce((a, r) => a + r.amt, 0n);
    const totalFees = buildFees([{ label: 'Jupiter route', usd6: 0n }], total, maxFeeBps, false);
    const vault = process.env.VAULT_ADDRESS || '0x0000000000000000000000000000000000000000';
    const typedData = {
      domain: { name: 'OwnbackVault', version: '1', chainId: ARC_CHAIN_ID, verifyingContract: vault },
      types: {
        BuyApproval: [
          { name: 'user', type: 'address' },
          { name: 'deadline', type: 'uint256' },
          { name: 'maxFeeUsd6', type: 'uint256' },
        ],
      },
      primaryType: 'BuyApproval' as const,
      message: {
        user: user.evmAddress ?? '0x0000000000000000000000000000000000000000',
        deadline: Math.floor((Date.now() + APPROVAL_TTL_MS) / 1000),
        maxFeeUsd6: maxFeeUsd6(total, maxFeeBps).toString(),
      },
    };
    const payload = { rows: reviewRows, totalUsd6: toUsd6(total), fees: totalFees, typedData };
    await sql`
      INSERT INTO quotes (id, user_id, payload, expires_at)
      VALUES (${quoteId}::uuid, ${user.id}::uuid, ${sql.json(payload as never)}, ${new Date(expiresAt)})
    `;
    return c.json({
      quoteId,
      expiresAt,
      rows: reviewRows,
      totalUsd6: toUsd6(total),
      fees: totalFees,
      destination: user.solAddress ?? user.evmAddress ?? '',
      approval: { kind: 'typed_data' as const, typedData },
    });
  } catch (e) {
    return jsonError(c, e);
  }
});

jarsBuysRoutes.post('/buys', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    if (!envFlag('KEEPER_ENABLED', false) && !mockChain()) throw new ApiError('KEEPER_DISABLED');
    const key = assertIdempotencyKey(c);
    const body = z
      .object({
        quoteId: z.string().uuid(),
        approval: z.unknown(),
        signature: z.string().min(1),
      })
      .parse(await c.req.json());
    const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const out = await withIdempotency(user.id, key, hash, async () => {
      const sql = getSql();
      const q = await sql<{ payload: unknown; expires_at: Date }[]>`
        SELECT payload, expires_at FROM quotes
        WHERE id = ${body.quoteId}::uuid AND user_id = ${user.id}::uuid
      `;
      if (!q[0]) throw new ApiError('NOT_FOUND');
      if (q[0].expires_at.getTime() < Date.now()) throw new ApiError('QUOTE_EXPIRED');
      // Real: verify EIP-712 + ERC-1271 (S20). MOCK accepts any signature.
      if (!mockChain()) throw new ApiError('BAD_SIGNATURE');

      const approvalId = newId();
      const approvalHash = randomBytes(32);
      const deadline = new Date(Date.now() + APPROVAL_TTL_MS);
      const payload = q[0].payload as { totalUsd6: string; rows: { assetId: string; amountUsd6: string }[] };
      const maxFee = (BigInt(payload.totalUsd6) / 20n).toString();
      await sql`
        INSERT INTO buy_approvals (id, user_id, hash, typed_data, signature, deadline, status, max_fee_usd6, created_at)
        VALUES (
          ${approvalId}::uuid, ${user.id}::uuid, ${approvalHash},
          ${sql.json(body.approval as never)}, ${Buffer.from(body.signature)},
          ${deadline}, 'signed', ${maxFee}::bigint, now()
        )
      `;
      const batchId = newId();
      await sql`
        INSERT INTO buy_batches (id, trigger, user_id, status, total_usd6, fees_usd6, fees_covered, slow, started_at)
        VALUES (${batchId}::uuid, 'approval', ${user.id}::uuid, 'approved', ${payload.totalUsd6}::bigint, 0, false, false, now())
      `;
      let idx = 0;
      for (const row of payload.rows) {
        await sql`
          INSERT INTO buy_entries (
            id, batch_id, user_id, asset_id, status, amount_usd6, approval_id, item_index, venue
          ) VALUES (
            ${newId()}::uuid, ${batchId}::uuid, ${user.id}::uuid, ${row.assetId}, 'quoted',
            ${row.amountUsd6}::bigint, ${approvalId}::uuid, ${idx++}, 'jupiter'
          )
        `;
      }
      return { batchIds: [batchId] };
    });
    return c.json(out);
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

jarsBuysRoutes.post('/buys/approvals/:hash/cancel', async (c) => {
  try {
    requireCsrf(c);
    await requireUser(c);
    return c.json({ action: mockEvmAction('Cancel buy approval') });
  } catch (e) {
    return jsonError(c, e);
  }
});

jarsBuysRoutes.get('/buys/:batchId', async (c) => {
  try {
    const user = await requireUser(c);
    const sql = getSql();
    const batches = await sql<
      {
        id: string;
        status: string;
        started_at: Date | null;
        arc_tx: string | null;
        slow: boolean;
        total_usd6: bigint;
        fees_usd6: bigint;
        fees_covered: boolean;
      }[]
    >`
      SELECT * FROM buy_batches WHERE id = ${c.req.param('batchId')}::uuid AND user_id = ${user.id}::uuid
    `;
    const b = batches[0];
    if (!b) throw new ApiError('NOT_FOUND');
    const entries = await sql<
      {
        asset_id: string;
        status: string;
        quote_price_usd6: bigint | null;
        max_price_usd6: bigint | null;
        fill_price_usd6: bigint | null;
        qty: string | null;
        amount_usd6: bigint;
        spent_usd6: bigint | null;
        venue_tx: string | null;
      }[]
    >`
      SELECT * FROM buy_entries WHERE batch_id = ${b.id}::uuid
    `;
    return c.json({
      batchId: b.id,
      status: b.status,
      startedAt: b.started_at?.toISOString() ?? new Date().toISOString(),
      arcTx: b.arc_tx ?? undefined,
      slow: b.slow,
      entries: entries.map((e) => ({
        assetId: e.asset_id,
        name: e.asset_id,
        status: e.status,
        quotePriceUsd6: toUsd6(e.quote_price_usd6 ?? 0n),
        maxPriceUsd6: toUsd6(e.max_price_usd6 ?? 0n),
        ...(e.fill_price_usd6 != null ? { fillPriceUsd6: toUsd6(e.fill_price_usd6) } : {}),
        ...(e.qty ? { qty: e.qty } : {}),
        amountUsd6: toUsd6(e.amount_usd6),
        ...(e.spent_usd6 != null ? { spentUsd6: toUsd6(e.spent_usd6) } : {}),
        ...(e.venue_tx ? { venueTx: e.venue_tx } : {}),
      })),
      destination: user.solAddress ?? user.evmAddress ?? '',
    });
  } catch (e) {
    return jsonError(c, e);
  }
});
