import { assetDisplayName } from '../lib/asset-name.js';
import { Hono } from 'hono';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getSql } from '../db/client.js';
import { ApiError } from '../shared/errors.js';
import { toUsd6 } from '../shared/money.js';
import { APPROVAL_TTL_MS, CENT_USD6, QUOTE_REFRESH_MS } from '../shared/timing.js';
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
import { readAssetFromArkiv } from '../lib/arkiv/read-asset.js';
import { ARC_CHAIN_ID } from '../shared/chains.js';
import { verifiedMint } from '../shared/assets.js';
import {
  feeFromImpact,
  jupiterBuyQuote,
  priceUsd6FromBuyQuote,
  rawToQty,
} from '../lib/jupiter-price.js';
import { executeBuySwap, relayConfigured } from '../lib/jupiter-swap.js';
import { keccak256, stringToHex } from 'viem';

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

function solscan(tx: string) {
  return tx === 'mock' ? undefined : `https://solscan.io/tx/${tx}`;
}

function assetIdBytes32(assetId: string): `0x${string}` {
  return keccak256(stringToHex(assetId));
}

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

async function buildBuyReview(
  user: Awaited<ReturnType<typeof requireUser>>,
  include: 'all' | 'ready',
  amounts: Map<string, bigint>,
) {
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

  const quoteId = newId();
  const expiresAt = new Date(Date.now() + QUOTE_REFRESH_MS).toISOString();
  const proofs = await Promise.all(filtered.map((r) => readAssetFromArkiv(r.asset_id, 'solana')));
  const now = new Date().toISOString();

  const priced = await Promise.all(
    filtered.map(async (r) => {
      const jarAmt = BigInt(r.amt);
      const override = amounts.get(r.asset_id);
      const spend = override != null && override < jarAmt ? override : jarAmt;
      const mint = verifiedMint(r.asset_id, 'solana');
      const quote = mint ? await jupiterBuyQuote(mint.mint, spend) : null;
      return { r, mint, quote, spend, jarAmt };
    }),
  );

  const reviewRows = priced.map(({ r, mint, quote, spend, jarAmt }, i) => {
    const fee = quote ? feeFromImpact(spend, quote.priceImpactPct) : 0n;
    const fees = buildFees([{ label: 'Jupiter route', usd6: fee }], spend, maxFeeBps, false);
    const outRaw = quote ? BigInt(quote.outAmount) : 0n;
    const priceUsd6 =
      mint && quote && outRaw > 0n ? priceUsd6FromBuyQuote(spend, outRaw, mint.decimals) : 0n;
    const selectable =
      Boolean(mint) && quote != null && outRaw > 0n && feeWithinCap(fee, spend, maxFeeBps);
    const maxPrice = priceUsd6 > 0n ? (priceUsd6 * 10_100n) / 10_000n : 0n;
    return {
      assetId: r.asset_id,
      name: assetDisplayName(r.asset_id),
      amountUsd6: toUsd6(spend),
      jarAmountUsd6: toUsd6(jarAmt),
      ...(mint
        ? {
            token: mint.symbol,
            mint: mint.mint,
            decimals: mint.decimals,
            issuer: mint.issuer,
          }
        : {}),
      chain: 'solana' as const,
      venue: 'jupiter' as const,
      price: { usd6PerUnit: toUsd6(priceUsd6), at: now, source: 'jupiter' as const },
      refPriceUsd6: toUsd6(priceUsd6),
      estQty: mint && outRaw > 0n ? rawToQty(outRaw, mint.decimals) : '0',
      outAmountRaw: outRaw.toString(),
      maxPriceUsd6: toUsd6(maxPrice),
      fees,
      selectable,
      ...(selectable ? {} : { reason: (mint ? 'fees_high' : 'no_venue') as 'fees_high' | 'no_venue' }),
      ...(proofs[i] ? { arkiv: proofs[i] } : {}),
      ...(quote ? { jupiterQuote: quote.raw } : {}),
    };
  });

  const selectableRows = reviewRows.filter((x) => x.selectable);
  const total = selectableRows.reduce((a, r) => a + BigInt(r.amountUsd6), 0n);
  const totalFee = selectableRows.reduce((a, r) => a + BigInt(r.fees.totalUsd6), 0n);
  const totalFees = buildFees([{ label: 'Jupiter route', usd6: totalFee }], total > 0n ? total : 1n, maxFeeBps, false);
  const vault = process.env.VAULT_ADDRESS || '0x0000000000000000000000000000000000000000';
  const deadline = Math.floor((Date.now() + APPROVAL_TTL_MS) / 1000);
  const items = selectableRows.map((row) => ({
    asset: assetIdBytes32(row.assetId),
    amount: row.amountUsd6,
    domain: 5, // Solana CCTP domain
    maxPriceUsd6: row.maxPriceUsd6,
  }));
  const typedData = {
    domain: { name: 'OwnbackVault', version: '1', chainId: ARC_CHAIN_ID, verifyingContract: vault as `0x${string}` },
    types: {
      Item: [
        { name: 'asset', type: 'bytes32' },
        { name: 'amount', type: 'uint256' },
        { name: 'domain', type: 'uint32' },
        { name: 'maxPriceUsd6', type: 'uint256' },
      ],
      BuyApproval: [
        { name: 'user', type: 'address' },
        { name: 'items', type: 'Item[]' },
        { name: 'maxFeeUsd6', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint64' },
      ],
    },
    primaryType: 'BuyApproval' as const,
    message: {
      user: (user.evmAddress ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
      items,
      maxFeeUsd6: maxFeeUsd6(total, maxFeeBps).toString(),
      nonce: Date.now().toString(),
      deadline,
    },
  };
  const payload = {
    rows: reviewRows,
    totalUsd6: toUsd6(total),
    fees: totalFees,
    typedData,
    amounts: Object.fromEntries([...amounts].map(([k, v]) => [k, v.toString()])),
  };
  await sql`
    INSERT INTO quotes (id, user_id, payload, expires_at)
    VALUES (${quoteId}::uuid, ${user.id}::uuid, ${sql.json(payload as never)}, ${new Date(expiresAt)})
  `;
  return {
    quoteId,
    expiresAt,
    rows: reviewRows.map(({ jupiterQuote: _j, ...rest }) => rest),
    totalUsd6: toUsd6(total),
    fees: totalFees,
    destination: user.solAddress ?? user.evmAddress ?? '',
    approval: { kind: 'typed_data' as const, typedData },
  };
}

jarsBuysRoutes.get('/buys/review', async (c) => {
  try {
    const user = await requireUser(c);
    const include = c.req.query('include') === 'all' ? 'all' : 'ready';
    const amounts = parseAmounts(c.req.query('amounts'));
    return c.json(await buildBuyReview(user, include, amounts));
  } catch (e) {
    return jsonError(c, e);
  }
});

jarsBuysRoutes.post('/buys/review', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const body = z
      .object({
        include: z.enum(['all', 'ready']).optional(),
        amounts: z.record(z.string().regex(/^\d+$/)).optional(),
      })
      .parse(await c.req.json().catch(() => ({})));
    const amounts = new Map<string, bigint>();
    for (const [k, v] of Object.entries(body.amounts ?? {})) {
      const n = roundCent(BigInt(v));
      if (n > 0n) amounts.set(k, n);
    }
    return c.json(await buildBuyReview(user, body.include === 'all' ? 'all' : 'ready', amounts));
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

jarsBuysRoutes.post('/buys', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
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
      // Real EIP-712 + ERC-1271 verify lands with O6 / S20. Accept any non-empty sig for now when
      // MOCK or when Solana venue path will run (signature proves user OK'd the review UI).
      if (!body.signature) throw new ApiError('BAD_SIGNATURE');
      if (!mockChain() && !envFlag('KEEPER_ENABLED', false) && !relayConfigured()) {
        // Still allow buy when we can mock-complete; otherwise need keeper or relay.
        throw new ApiError('KEEPER_DISABLED');
      }

      type Row = {
        assetId: string;
        amountUsd6: string;
        selectable?: boolean;
        mint?: string;
        decimals?: number;
        outAmountRaw?: string;
      };
      const payload = q[0].payload as { totalUsd6: string; rows: Row[] };
      const buyRows = payload.rows.filter((r) => r.selectable !== false && BigInt(r.amountUsd6) > 0n);
      if (!buyRows.length) throw new ApiError('NO_READY_JARS');

      const approvalId = newId();
      const approvalHash = randomBytes(32);
      const deadline = new Date(Date.now() + APPROVAL_TTL_MS);
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
      const total = buyRows.reduce((s, r) => s + BigInt(r.amountUsd6), 0n);
      await sql`
        INSERT INTO buy_batches (id, trigger, user_id, status, total_usd6, fees_usd6, fees_covered, slow, started_at)
        VALUES (${batchId}::uuid, 'approval', ${user.id}::uuid, 'swapping', ${total.toString()}::bigint, 0, false, false, now())
      `;
      let idx = 0;
      for (const row of buyRows) {
        await sql`
          INSERT INTO buy_entries (
            id, batch_id, user_id, asset_id, status, amount_usd6, approval_id, item_index, venue
          ) VALUES (
            ${newId()}::uuid, ${batchId}::uuid, ${user.id}::uuid, ${row.assetId}, 'quoted',
            ${row.amountUsd6}::bigint, ${approvalId}::uuid, ${idx++}, 'jupiter'
          )
        `;
      }

      let bought = 0;
      for (const row of buyRows) {
        const amount = BigInt(row.amountUsd6);
        const mint = verifiedMint(row.assetId, 'solana');
        let venueTx = 'mock';
        let qty = '0';
        let priceUsd6 = 0n;
        let status: 'bought' | 'paused' = 'bought';

        if (!mockChain() && relayConfigured() && mint && user.solAddress) {
          try {
            const swap = await executeBuySwap({
              userSolAddress: user.solAddress,
              mint: mint.mint,
              amountUsd6: amount,
              decimals: mint.decimals,
            });
            venueTx = swap.venueTx;
            qty = rawToQty(BigInt(swap.outAmountRaw), mint.decimals);
            priceUsd6 = priceUsd6FromBuyQuote(amount, BigInt(swap.outAmountRaw), mint.decimals);
          } catch {
            status = 'paused';
          }
        } else if (mockChain() && mint) {
          const quote = await jupiterBuyQuote(mint.mint, amount);
          if (quote) {
            qty = rawToQty(BigInt(quote.outAmount), mint.decimals);
            priceUsd6 = priceUsd6FromBuyQuote(amount, BigInt(quote.outAmount), mint.decimals);
          }
        } else if (!mint) {
          status = 'paused';
        }

        if (status === 'bought') {
          bought++;
          await sql`
            UPDATE buy_entries SET
              status = 'bought',
              spent_usd6 = ${amount.toString()}::bigint,
              quote_price_usd6 = ${priceUsd6.toString()}::bigint,
              fill_price_usd6 = ${priceUsd6.toString()}::bigint,
              max_price_usd6 = ${priceUsd6 > 0n ? ((priceUsd6 * 10_100n) / 10_000n).toString() : '0'}::bigint,
              qty = ${qty}::numeric,
              venue_tx = ${venueTx}
            WHERE batch_id = ${batchId}::uuid AND asset_id = ${row.assetId}
          `;
          // shortcut: empty this asset's jars on buy (partial override still clears jar for MVP testing); lot-FIFO later.
          await sql`
            UPDATE allocations a SET bought_usd6 = a.saved_usd6
            FROM purchases p
            WHERE a.purchase_id = p.id AND p.user_id = ${user.id}::uuid
              AND p.status = 'saved' AND a.asset_id = ${row.assetId} AND a.selected = true
          `;
        } else {
          await sql`
            UPDATE buy_entries SET status = 'paused'
            WHERE batch_id = ${batchId}::uuid AND asset_id = ${row.assetId}
          `;
        }
      }

      const batchStatus =
        bought === buyRows.length ? 'done' : bought > 0 ? 'done_partial' : 'failed';
      await sql`
        UPDATE buy_batches SET status = ${batchStatus}, finished_at = now()
        WHERE id = ${batchId}::uuid
      `;
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
    const boughtUsd6 = entries
      .filter((e) => e.status === 'bought')
      .reduce((s, e) => s + (e.spent_usd6 ?? e.amount_usd6), 0n);
    const leftInJars = entries
      .filter((e) => e.status !== 'bought')
      .reduce((s, e) => s + e.amount_usd6, 0n);
    const done = /^done/.test(b.status) || b.status === 'failed';
    return c.json({
      batchId: b.id,
      status: b.status,
      startedAt: b.started_at?.toISOString() ?? new Date().toISOString(),
      arcTx: b.arc_tx ?? undefined,
      ...(b.arc_tx ? { links: { arc: `https://explorer.arc.network/tx/${b.arc_tx}` } } : {}),
      slow: b.slow,
      entries: entries.map((e) => ({
        assetId: e.asset_id,
        name: assetDisplayName(e.asset_id),
        status: e.status,
        quotePriceUsd6: toUsd6(e.quote_price_usd6 ?? 0n),
        maxPriceUsd6: toUsd6(e.max_price_usd6 ?? 0n),
        ...(e.fill_price_usd6 != null ? { fillPriceUsd6: toUsd6(e.fill_price_usd6) } : {}),
        ...(e.qty ? { qty: e.qty } : {}),
        amountUsd6: toUsd6(e.amount_usd6),
        ...(e.spent_usd6 != null ? { spentUsd6: toUsd6(e.spent_usd6) } : {}),
        ...(e.venue_tx ? { venueTx: e.venue_tx, explorerUrl: solscan(e.venue_tx) } : {}),
      })),
      ...(done
        ? {
            totals: {
              boughtUsd6: toUsd6(boughtUsd6),
              leftInJarsUsd6: toUsd6(leftInJars),
              feesUsd6: toUsd6(b.fees_usd6),
              feesPctBps: 0,
              feesCovered: b.fees_covered,
              slippageBps: 0,
              returnedUsd6: '0',
            },
          }
        : {}),
      destination: user.solAddress ?? user.evmAddress ?? '',
    });
  } catch (e) {
    return jsonError(c, e);
  }
});
