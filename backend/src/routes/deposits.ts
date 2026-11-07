import { syncArcWallet } from '../lib/wallet-sync.js';
import { Hono } from 'hono';
import { z } from 'zod';
import { getSql } from '../db/client.js';
import { ApiError } from '../shared/errors.js';
import { isDepositChain, type DepositChain } from '../shared/chains.js';
import { toUsd6 } from '../shared/money.js';
import { MIN_DEPOSIT_USD6 } from '../shared/timing.js';
import {
  assertIdempotencyKey,
  jsonError,
  mockEvmAction,
  requireCsrf,
  requireUser,
  withIdempotency,
} from '../lib/http.js';
import { createHash } from 'node:crypto';

export const depositRoutes = new Hono();

function depositJson(d: {
  id: string;
  chain: string;
  amount_usd6: bigint;
  from_address: string;
  tx_hash: string;
  status: string;
  confirmations: number;
  slow: boolean;
  forward_tx: string | null;
  fees_usd6: bigint;
}) {
  return {
    id: d.id,
    chain: d.chain,
    amountUsd6: toUsd6(d.amount_usd6),
    fromAddress: d.from_address,
    txHash: d.tx_hash,
    status: d.status,
    fees: undefined,
    forwardTx: d.forward_tx ?? undefined,
    confirmations: { have: d.confirmations, need: d.chain === 'arc' || d.chain === 'solana' ? 1 : 12 },
    slow: d.slow,
  };
}

depositRoutes.get('/deposits/address', async (c) => {
  try {
    const user = await requireUser(c);
    const chain = c.req.query('chain') ?? '';
    if (!isDepositChain(chain)) throw new ApiError('CHAIN_UNSUPPORTED');
    const address =
      chain === 'solana'
        ? user.solAddress
        : user.evmAddress;
    if (!address) throw new ApiError('NOT_FOUND');
    const sameAddressChains: DepositChain[] =
      chain === 'solana' ? ['solana'] : ['arc', 'base', 'ethereum', 'arbitrum'];
    return c.json({
      chain,
      address,
      minUsd6: toUsd6(MIN_DEPOSIT_USD6),
      sameAddressChains,
    });
  } catch (e) {
    return jsonError(c, e);
  }
});

depositRoutes.get('/deposits/watch', async (c) => {
  try {
    const user = await requireUser(c);
    const chain = c.req.query('chain') ?? '';
    if (!isDepositChain(chain)) throw new ApiError('CHAIN_UNSUPPORTED');
    // Arc: read the wallet (throttled to 15 s) so a new transfer is recorded before we look for it.
    if (chain === 'arc') await syncArcWallet(user);
    const sql = getSql();
    const since = c.req.query('since');
    const rows = since
      ? await sql<Parameters<typeof depositJson>[0][]>`
          SELECT * FROM deposits
          WHERE user_id = ${user.id}::uuid AND chain = ${chain} AND seen_at > ${since}::timestamptz
          ORDER BY seen_at DESC LIMIT 1
        `
      : await sql<Parameters<typeof depositJson>[0][]>`
          SELECT * FROM deposits
          WHERE user_id = ${user.id}::uuid AND chain = ${chain}
          ORDER BY seen_at DESC LIMIT 1
        `;
    return c.json({
      checkedAt: new Date().toISOString(),
      ...(rows[0] ? { deposit: depositJson(rows[0]) } : {}),
    });
  } catch (e) {
    return jsonError(c, e);
  }
});

depositRoutes.post('/deposits/auto-add', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const body = z
      .object({ chain: z.enum(['ethereum', 'base', 'arbitrum']), capUsd6: z.string().regex(/^\d+$/) })
      .parse(await c.req.json());
    const sql = getSql();
    const rules = await sql<{ auto_add: Record<string, { on: boolean; capUsd6: string }> }[]>`
      SELECT auto_add FROM rules WHERE user_id = ${user.id}::uuid
    `;
    const autoAdd = { ...(rules[0]?.auto_add ?? {}) };
    autoAdd[body.chain] = { on: true, capUsd6: body.capUsd6 };
    await sql`
      UPDATE rules SET auto_add = ${sql.json(autoAdd as never)}, onchain_synced_at = NULL, updated_at = now()
      WHERE user_id = ${user.id}::uuid
    `;
    return c.json({
      action: mockEvmAction(`Approve auto-add from ${body.chain} up to $${Number(BigInt(body.capUsd6) / 1_000_000n)}`),
    });
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

depositRoutes.delete('/deposits/auto-add', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const chain = c.req.query('chain') ?? '';
    if (!['ethereum', 'base', 'arbitrum'].includes(chain)) throw new ApiError('CHAIN_UNSUPPORTED');
    const sql = getSql();
    const rules = await sql<{ auto_add: Record<string, { on: boolean; capUsd6: string }> }[]>`
      SELECT auto_add FROM rules WHERE user_id = ${user.id}::uuid
    `;
    const autoAdd = { ...(rules[0]?.auto_add ?? {}) };
    autoAdd[chain] = { on: false, capUsd6: autoAdd[chain]?.capUsd6 ?? '0' };
    await sql`
      UPDATE rules SET auto_add = ${sql.json(autoAdd as never)}, updated_at = now()
      WHERE user_id = ${user.id}::uuid
    `;
    return c.json({ action: mockEvmAction(`Turn off auto-add on ${chain}`) });
  } catch (e) {
    return jsonError(c, e);
  }
});

depositRoutes.post('/deposits/:id/approve', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const sql = getSql();
    const rows = await sql<{ id: string; status: string; amount_usd6: bigint }[]>`
      SELECT id, status, amount_usd6 FROM deposits
      WHERE id = ${c.req.param('id')}::uuid AND user_id = ${user.id}::uuid
    `;
    const d = rows[0];
    if (!d) throw new ApiError('NOT_FOUND');
    if (d.status !== 'needs_approval') throw new ApiError('DEPOSIT_NOT_READY');
    return c.json({
      action: mockEvmAction(`Add $${Number(d.amount_usd6 / 1_000_000n)}.${String(d.amount_usd6 % 1_000_000n).padStart(2,'0').slice(0,2)} to your vault`),
    });
  } catch (e) {
    return jsonError(c, e);
  }
});

depositRoutes.post('/deposits/:id/submitted', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const key = assertIdempotencyKey(c);
    const body = await c.req.json().catch(() => ({}));
    const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const result = await withIdempotency(user.id, key, hash, async () => {
      const sql = getSql();
      const rows = await sql<Parameters<typeof depositJson>[0][]>`
        SELECT * FROM deposits WHERE id = ${c.req.param('id')}::uuid AND user_id = ${user.id}::uuid
      `;
      if (!rows[0]) throw new ApiError('NOT_FOUND');
      // Trust boundary: real path reads Arc receipts. MOCK: mark added.
      await sql`
        UPDATE deposits SET status = 'added', added_at = now()
        WHERE id = ${c.req.param('id')}::uuid
      `;
      const updated = await sql<Parameters<typeof depositJson>[0][]>`
        SELECT * FROM deposits WHERE id = ${c.req.param('id')}::uuid
      `;
      return depositJson(updated[0]!);
    });
    return c.json(result);
  } catch (e) {
    return jsonError(c, e);
  }
});
