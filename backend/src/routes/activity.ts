import { freeByChain } from '../lib/wallet-sync.js';
import { assetDisplayName } from '../lib/asset-name.js';
import { Hono } from 'hono';
import { z } from 'zod';
import { getSql } from '../db/client.js';
import { ApiError } from '../shared/errors.js';
import { formatUsd, toUsd6 } from '../shared/money.js';
import { envFlag } from '../lib/env.js';
import {
  assertIdempotencyKey,
  jsonError,
  mockEvmAction,
  requireCsrf,
  requireUser,
  withIdempotency,
} from '../lib/http.js';
import { createHash } from 'node:crypto';
import { newId, shareId } from '../lib/ids.js';
import { EXPLORER, isDepositChain } from '../shared/chains.js';
import { portfolio, type Held } from '../lib/portfolio.js';
import { qtyToRaw } from '../lib/qty.js';
import { iconField, verifiedMint } from '../shared/assets.js';

export const activityRoutes = new Hono();

activityRoutes.get('/activity', async (c) => {
  try {
    const user = await requireUser(c);
    const sql = getSql();
    const rows = await sql<{ id: string; kind: string; payload: Record<string, unknown>; link: string | null; created_at: Date }[]>`
      SELECT id, kind, payload, link, created_at FROM events
      WHERE user_id = ${user.id}::uuid
      ORDER BY created_at DESC LIMIT 50
    `;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayItems = [];
    const earlierItems = [];
    for (const r of rows) {
      // copy-and-errors.md § Activity titles: deposit_added → "{amount} added" · "From {chain}"
      const amt = typeof r.payload?.amountUsd6 === 'string' ? formatUsd(r.payload.amountUsd6) : null;
      const chainName = r.payload?.chain === 'arc' ? 'Arc' : typeof r.payload?.chain === 'string' ? r.payload.chain : null;
      const item = {
        id: r.id,
        kind: r.kind,
        title: r.kind === 'deposit_added' && amt ? `${amt} added`
          : r.kind === 'buy_done' && amt ? `Bought ${amt} of ${assetDisplayName(String(r.payload.assetId))}`
          : r.kind === 'sell_done' && amt ? `Sold ${assetDisplayName(String(r.payload.assetId))} for ${amt}`
          : r.kind,
        body: r.kind === 'deposit_added' && chainName ? `From ${chainName}`
          : (r.kind === 'buy_done' || r.kind === 'sell_done') && typeof r.payload?.tx === 'string' ? EXPLORER.solTx(r.payload.tx) : '',
        link: r.link ?? '/',
        at: r.created_at.toISOString(),
      };
      if (r.created_at >= today) todayItems.push(item);
      else earlierItems.push(item);
    }
    const groups = [];
    if (todayItems.length) groups.push({ label: 'Today' as const, items: todayItems });
    if (earlierItems.length) groups.push({ label: 'Earlier' as const, items: earlierItems });
    return c.json({ groups });
  } catch (e) {
    return jsonError(c, e);
  }
});

activityRoutes.get('/receipts', async (c) => {
  try {
    const user = await requireUser(c);
    const filter = c.req.query('filter') ?? 'all';
    const sql = getSql();
    const rows = await sql<
      {
        id: string;
        shop: string | null;
        amount_usd6: bigint | null;
        invest_usd6: bigint | null;
        purchased_on: string | null;
        status: string;
        items: unknown;
        currency: string | null;
        amount_local: string | null;
      }[]
    >`
      SELECT id, shop, amount_usd6, invest_usd6, purchased_on::text, status, items, currency, amount_local::text
      FROM purchases
      WHERE user_id = ${user.id}::uuid AND status NOT IN ('deleted', 'read_failed', 'skipped', 'reading')
      ORDER BY created_at DESC LIMIT 50
    `;
    const mapped = rows
      .map((r) => {
        const items = Array.isArray(r.items) ? (r.items as { name?: string }[]) : [];
        let status: 'bought' | 'in_jar' | 'needs_review' | 'fallback' = 'in_jar';
        if (r.status === 'needs_review') status = 'needs_review';
        else if (r.status === 'saved') status = 'in_jar';
        return {
          id: r.id,
          shop: r.shop ?? '',
          item: items[0]?.name ?? '',
          local: { amount: r.amount_local ?? '0', currency: r.currency ?? 'USD' },
          amountUsd6: toUsd6(r.amount_usd6 ?? 0n),
          date: r.purchased_on ?? '',
          status,
          investUsd6: toUsd6(r.invest_usd6 ?? 0n),
          month: (r.purchased_on ?? '').slice(0, 7),
        };
      })
      .filter((r) => {
        if (filter === 'all') return true;
        if (filter === 'in_jars') return r.status === 'in_jar';
        if (filter === 'bought') return false; // bought is derived when all allocations bought; not stored yet
        if (filter === 'needs_review') return r.status === 'needs_review';
        return true;
      });
    const groupsMap = new Map<string, typeof mapped>();
    for (const r of mapped) {
      const list = groupsMap.get(r.month) ?? [];
      list.push(r);
      groupsMap.set(r.month, list);
    }
    const spent = mapped.reduce((a, r) => a + BigInt(r.amountUsd6), 0n);
    const put = mapped.reduce((a, r) => a + BigInt(r.investUsd6), 0n);
    return c.json({
      stats: { count: mapped.length, spentUsd6: toUsd6(spent), putToWorkUsd6: toUsd6(put) },
      groups: [...groupsMap.entries()].map(([month, rows]) => ({
        month,
        rows: rows.map(({ month: _m, ...rest }) => rest),
      })),
      nextCursor: null,
    });
  } catch (e) {
    return jsonError(c, e);
  }
});

activityRoutes.get('/receipts/:id', async (c) => {
  try {
    const user = await requireUser(c);
    const sql = getSql();
    const rows = await sql<Record<string, unknown>[]>`
      SELECT * FROM purchases WHERE id = ${c.req.param('id')}::uuid AND user_id = ${user.id}::uuid
    `;
    if (!rows[0]) throw new ApiError('NOT_FOUND');
    const p = rows[0];
    const allocs = await sql<{ asset_id: string; amount_usd6: bigint; role: string; why: string | null }[]>`
      SELECT asset_id, amount_usd6, role, why FROM allocations WHERE purchase_id = ${p.id as string}::uuid
    `;
    return c.json({
      receipt: {
        shop: p.shop,
        place: p.place,
        date: p.purchased_on,
        items: Array.isArray(p.items) ? (p.items as { name: string }[]).map((i) => i.name) : [],
        local: { amount: String(p.amount_local ?? '0'), currency: p.currency ?? 'USD' },
        fxRate: String(p.fx_rate ?? '1'),
        amountUsd6: toUsd6((p.amount_usd6 as bigint) ?? 0n),
      },
      investUsd6: toUsd6((p.invest_usd6 as bigint) ?? 0n),
      where: allocs.map((a) => ({
        label: a.asset_id,
        detail: a.why ?? a.role,
        amountUsd6: toUsd6(a.amount_usd6),
        assetIds: [a.asset_id],
      })),
      proof: { links: {} },
      stored: 'fields_only' as const,
    });
  } catch (e) {
    return jsonError(c, e);
  }
});

activityRoutes.delete('/receipts/:id', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const sql = getSql();
    await sql`
      UPDATE purchases SET
        status = 'deleted', shop = NULL, place = NULL, items = NULL, updated_at = now()
      WHERE id = ${c.req.param('id')}::uuid AND user_id = ${user.id}::uuid
    `;
    return c.body(null, 204);
  } catch (e) {
    return jsonError(c, e);
  }
});

activityRoutes.delete('/receipts', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const sql = getSql();
    await sql`
      UPDATE purchases SET status = 'deleted', shop = NULL, place = NULL, items = NULL, updated_at = now()
      WHERE user_id = ${user.id}::uuid
    `;
    return c.body(null, 204);
  } catch (e) {
    return jsonError(c, e);
  }
});

export function balanceJson(p: Awaited<ReturnType<typeof portfolio>>, inJars: bigint) {
  return {
    totalUsd6: toUsd6(p.dollars + p.owned),
    byType: { stocksCommodities: toUsd6(p.owned), stablecoins: toUsd6(p.dollars), crypto: '0' },
    byChain: { arc: toUsd6(p.arcUsdc), solana: toUsd6(p.solUsdc), base: '0', ethereum: '0', arbitrum: '0', bnb: '0' },
    pricesAt: new Date().toISOString(),
    stale: p.stale,
    usdc: { freeUsd6: toUsd6(p.dollars), inJarsUsd6: toUsd6(inJars), arrivingUsd6: toUsd6(p.arriving) },
  };
}

export function heldRow(h: Held) {
  return { assetId: h.assetId, name: h.name, ...iconField(h.assetId), subtitle: `${h.qty} ${h.token} · Solana`, qty: h.qty, token: h.token, chain: 'solana', valueUsd6: toUsd6(h.valueUsd6), ...(h.priceUsd6 > 0n ? { price: { usd6PerUnit: toUsd6(h.priceUsd6), at: new Date().toISOString(), source: 'jupiter' as const } } : {}) };
}

export async function jarsTotal(userId: string): Promise<bigint> {
  const [r] = await getSql()<{ amount: bigint }[]>`
    SELECT COALESCE(SUM(a.saved_usd6 - a.bought_usd6), 0) AS amount
    FROM allocations a JOIN purchases p ON p.id = a.purchase_id
    WHERE p.user_id = ${userId}::uuid AND p.status = 'saved' AND a.selected = true`;
  return BigInt(r?.amount ?? 0);
}

activityRoutes.get('/holdings', async (c) => {
  try {
    const user = await requireUser(c);
    const [p, inJars] = await Promise.all([portfolio(user, { fresh: c.req.header('cache-control')?.includes('no-cache') }), jarsTotal(user.id)]);
    const usdcRows = [
      { assetId: 'usdc', name: 'USDC on Arc', subtitle: 'Free to buy with', chain: 'arc', valueUsd6: toUsd6(p.arcUsdc) },
      ...(p.solUsdc > 0n ? [{ assetId: 'usdc-sol', name: 'USDC on Solana', subtitle: 'From sells or unspent buys', chain: 'solana', valueUsd6: toUsd6(p.solUsdc) }] : []),
    ];
    return c.json({
      balance: balanceJson(p, inJars),
      sections: [
        ...(p.held.length ? [{ key: 'stocksCommodities' as const, totalUsd6: toUsd6(p.owned), rows: p.held.map(heldRow) }] : []),
        { key: 'stablecoins' as const, totalUsd6: toUsd6(p.dollars), rows: usdcRows },
      ],
    });
  } catch (e) {
    return jsonError(c, e);
  }
});

activityRoutes.get('/holdings/:assetId', async (c) => {
  try {
    const user = await requireUser(c);
    const assetId = c.req.param('assetId');
    const sql = getSql();
    const [p, rows] = await Promise.all([
      portfolio(user, { fresh: c.req.header('cache-control')?.includes('no-cache') }),
      sql<{ spent: bigint; qty: string | null; fill: bigint | null; batch_id: string; venue_tx: string | null; arc_tx: string | null; started_at: Date | null }[]>`
        SELECT e.spent_usd6 AS spent, e.qty::text AS qty, e.fill_price_usd6 AS fill, e.batch_id, e.venue_tx, b.arc_tx, b.started_at
        FROM buy_entries e JOIN buy_batches b ON b.id = e.batch_id
        WHERE e.user_id = ${user.id}::uuid AND e.asset_id = ${assetId} AND e.status = 'bought'
        ORDER BY b.started_at DESC NULLS LAST`,
    ]);
    const h = p.held.find((x) => x.assetId === assetId);
    const mint = verifiedMint(assetId, 'solana');
    const paid = rows.reduce((s, r) => s + BigInt(r.spent ?? 0), 0n);
    const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
    const paidYear = rows.filter((r) => (r.started_at ?? new Date()) >= yearStart).reduce((s, r) => s + BigInt(r.spent ?? 0), 0n);
    const boughtRaw = mint ? rows.reduce((s, r) => s + (r.qty ? qtyToRaw(r.qty, mint.decimals) ?? 0n : 0n), 0n) : 0n;
    const avg = mint && boughtRaw > 0n ? (paid * 10n ** BigInt(mint.decimals)) / boughtRaw : 0n;
    const last = rows[0];
    return c.json({
      assetId,
      name: assetDisplayName(assetId),
      ...iconField(assetId),
      subtitle: h ? `${h.qty} ${h.token} in your wallet` : '',
      ...(h ? { qty: h.qty } : {}),
      ...(mint ? { token: mint.symbol, chain: 'solana' } : {}),
      valueUsd6: toUsd6(h?.valueUsd6 ?? 0n),
      spentThisYearUsd6: toUsd6(paidYear),
      price: { usd6PerUnit: toUsd6(h?.priceUsd6 ?? 0n), at: new Date().toISOString(), source: 'jupiter' as const },
      avgPriceUsd6: toUsd6(avg),
      paidTotalUsd6: toUsd6(paid),
      buys: rows.map((r) => ({
        batchId: r.batch_id,
        at: (r.started_at ?? new Date()).toISOString(),
        qty: r.qty ? String(r.qty).replace(/\.?0+$/, '') : '0',
        priceUsd6: toUsd6(r.fill ?? 0n),
        amountUsd6: toUsd6(r.spent ?? 0n),
      })),
      proof: {
        ...(last?.arc_tx ? { arcTx: last.arc_tx } : {}),
        ...(last?.venue_tx ? { venueTx: last.venue_tx } : {}),
        links: {
          ...(last?.arc_tx ? { arc: EXPLORER.arcTx(last.arc_tx) } : {}),
          ...(last?.venue_tx ? { venue: EXPLORER.solTx(last.venue_tx) } : {}),
          ...(mint ? { mint: `https://solscan.io/token/${mint.mint}` } : {}),
        },
      },
      issuerNote: mint ? `${mint.symbol} is issued by ${mint.issuer ?? 'the issuer'} on Solana · mint ${mint.mint} · ${mint.decimals} decimals` : 'Not on-chain yet',
    });
  } catch (e) {
    return jsonError(c, e);
  }
});

activityRoutes.post('/withdraw', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const key = assertIdempotencyKey(c);
    const body = z
      .object({ amountUsd6: z.string().regex(/^\d+$/), chain: z.string() })
      .parse(await c.req.json());
    if (!isDepositChain(body.chain)) throw new ApiError('CHAIN_UNSUPPORTED');
    if (body.chain === 'solana' && !user.solAddress) throw new ApiError('NO_SOLANA_RECIPIENT');
    const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const out = await withIdempotency(user.id, key, hash, async () => {
      const sql = getSql();
      const free = await sql<{ amount: bigint }[]>`
        SELECT COALESCE(SUM(amount_usd6), 0) AS amount FROM deposits
        WHERE user_id = ${user.id}::uuid AND status = 'added'
      `;
      const amount = BigInt(body.amountUsd6);
      if (amount > (free[0]?.amount ?? 0n)) {
        throw new ApiError('INSUFFICIENT_FREE', {
          freeUsd6: toUsd6(free[0]?.amount ?? 0n),
          shortUsd6: toUsd6(amount - (free[0]?.amount ?? 0n)),
        });
      }
      const id = newId();
      await sql`
        INSERT INTO withdrawals (id, user_id, chain, amount_usd6, fee_usd6, status, created_at)
        VALUES (${id}::uuid, ${user.id}::uuid, ${body.chain}, ${amount.toString()}::bigint, 0, 'sending', now())
      `;
      return {
        withdrawalId: id,
        action: mockEvmAction(`Withdraw to your wallet on ${body.chain}`),
        feeUsd6: '0',
        feeCovered: true,
      };
    });
    return c.json(out);
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

activityRoutes.post('/withdraw/:id/submitted', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const sql = getSql();
    await sql`
      UPDATE withdrawals SET status = 'sent' WHERE id = ${c.req.param('id')}::uuid AND user_id = ${user.id}::uuid
    `;
    const rows = await sql<Record<string, unknown>[]>`
      SELECT * FROM withdrawals WHERE id = ${c.req.param('id')}::uuid
    `;
    if (!rows[0]) throw new ApiError('NOT_FOUND');
    const w = rows[0];
    return c.json({
      id: w.id,
      chain: w.chain,
      amountUsd6: toUsd6(w.amount_usd6 as bigint),
      feeUsd6: toUsd6(w.fee_usd6 as bigint),
      status: w.status,
      createdAt: (w.created_at as Date).toISOString(),
    });
  } catch (e) {
    return jsonError(c, e);
  }
});

activityRoutes.get('/withdraw/:id', async (c) => {
  try {
    const user = await requireUser(c);
    const sql = getSql();
    const rows = await sql<Record<string, unknown>[]>`
      SELECT * FROM withdrawals WHERE id = ${c.req.param('id')}::uuid AND user_id = ${user.id}::uuid
    `;
    if (!rows[0]) throw new ApiError('NOT_FOUND');
    const w = rows[0];
    return c.json({
      id: w.id,
      chain: w.chain,
      amountUsd6: toUsd6(w.amount_usd6 as bigint),
      feeUsd6: toUsd6(w.fee_usd6 as bigint),
      status: w.status,
      createdAt: (w.created_at as Date).toISOString(),
    });
  } catch (e) {
    return jsonError(c, e);
  }
});

activityRoutes.put('/notifications', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const body = z
      .object({ buyDone: z.boolean(), needsReview: z.boolean(), nearLimit: z.boolean() })
      .parse(await c.req.json());
    const sql = getSql();
    await sql`
      UPDATE rules SET
        notify_buy_done = ${body.buyDone},
        notify_needs_review = ${body.needsReview},
        notify_near_limit = ${body.nearLimit},
        updated_at = now()
      WHERE user_id = ${user.id}::uuid
    `;
    return c.json(body);
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

activityRoutes.post('/push/subscribe', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const body = await c.req.json();
    const sql = getSql();
    const endpoint = body.endpoint as string;
    await sql`
      INSERT INTO push_subscriptions (id, user_id, endpoint, keys, created_at)
      VALUES (${newId()}::uuid, ${user.id}::uuid, ${endpoint}, ${sql.json(body.keys ?? body)}, now())
      ON CONFLICT (endpoint) DO UPDATE SET keys = EXCLUDED.keys
    `;
    return c.body(null, 204);
  } catch (e) {
    return jsonError(c, e);
  }
});

activityRoutes.post('/share', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const body = z
      .object({
        assetId: z.string().optional(),
        batchId: z.string().uuid().optional(),
        showAmounts: z.boolean(),
      })
      .parse(await c.req.json());
    const id = shareId();
    const sql = getSql();
    await sql`
      INSERT INTO share_cards (id, user_id, asset_id, batch_id, show_amounts, created_at)
      VALUES (${id}, ${user.id}::uuid, ${body.assetId ?? null}, ${body.batchId ?? null}::uuid, ${body.showAmounts}, now())
    `;
    return c.json({ shareId: id });
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

activityRoutes.delete('/share/:shareId', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const sql = getSql();
    await sql`
      UPDATE share_cards SET revoked_at = now()
      WHERE id = ${c.req.param('shareId')} AND user_id = ${user.id}::uuid
    `;
    return c.body(null, 204);
  } catch (e) {
    return jsonError(c, e);
  }
});

activityRoutes.post('/og/connect', async (c) => {
  try {
    requireCsrf(c);
    await requireUser(c);
    if (!envFlag('OG_SIGNIN', false)) throw new ApiError('FEATURE_OFF');
    return c.json({ authUrl: 'https://0g.ai/oauth/mock' });
  } catch (e) {
    return jsonError(c, e);
  }
});

// Gmail
activityRoutes.get('/gmail/state', async (c) => {
  try {
    const user = await requireUser(c);
    if (user.authKind === 'seed') return c.json({ state: 'none' });
    const sql = getSql();
    const rows = await sql<{ state: string; email: string; progress_done: number; progress_total: number; last_scan_at: Date | null }[]>`
      SELECT state, email, progress_done, progress_total, last_scan_at FROM gmail_connections
      WHERE user_id = ${user.id}::uuid
    `;
    if (!rows[0]) return c.json({ state: 'no_access' });
    const r = rows[0];
    return c.json({
      state: r.state,
      email: r.email,
      progress: { done: r.progress_done, total: r.progress_total },
      lastCheckedAt: r.last_scan_at?.toISOString(),
    });
  } catch (e) {
    return jsonError(c, e);
  }
});

activityRoutes.post('/gmail/connect', async (c) => {
  try {
    requireCsrf(c);
    await requireUser(c);
    if (!envFlag('GMAIL_ENABLED', false)) throw new ApiError('GMAIL_DISABLED');
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new ApiError('GMAIL_DISABLED');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&scope=https://www.googleapis.com/auth/gmail.readonly&response_type=code&access_type=offline&prompt=consent`;
    return c.json({ authUrl });
  } catch (e) {
    return jsonError(c, e);
  }
});

activityRoutes.get('/gmail/callback', async (c) => {
  // Public OAuth redirect — token exchange when GMAIL_ENABLED + secrets exist.
  return c.redirect('/add');
});

activityRoutes.post('/gmail/scan', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    if (!envFlag('GMAIL_ENABLED', false)) throw new ApiError('GMAIL_DISABLED');
    const sql = getSql();
    await sql`
      UPDATE gmail_connections SET state = 'scanning' WHERE user_id = ${user.id}::uuid
    `;
    return c.json({ state: 'scanning' });
  } catch (e) {
    return jsonError(c, e);
  }
});

activityRoutes.get('/gmail/invoices', async (c) => {
  try {
    const user = await requireUser(c);
    const sql = getSql();
    const conn = await sql<{ email: string; last_scan_at: Date | null }[]>`
      SELECT email, last_scan_at FROM gmail_connections WHERE user_id = ${user.id}::uuid
    `;
    const items = await sql<Record<string, unknown>[]>`
      SELECT message_id, shop, summary, amount_local, currency, amount_usd6, sent_on, status
      FROM gmail_messages WHERE user_id = ${user.id}::uuid ORDER BY sent_on DESC NULLS LAST LIMIT 50
    `;
    return c.json({
      email: conn[0]?.email ?? '',
      checkedAt: conn[0]?.last_scan_at?.toISOString() ?? new Date().toISOString(),
      items: items.map((m) => ({
        messageId: m.message_id,
        shop: m.shop,
        summary: m.summary,
        local: { amount: String(m.amount_local ?? '0'), currency: m.currency ?? 'USD' },
        amountUsd6: toUsd6((m.amount_usd6 as bigint) ?? 0n),
        date: m.sent_on,
        status: m.status,
      })),
    });
  } catch (e) {
    return jsonError(c, e);
  }
});

activityRoutes.post('/gmail/invoices/match', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const key = assertIdempotencyKey(c);
    const body = z.object({ messageIds: z.array(z.string()).min(1) }).parse(await c.req.json());
    const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const out = await withIdempotency(user.id, key, hash, async () => {
      // Full match pipeline needs registry + 0G; return empty purchaseIds until then.
      return { purchaseIds: [] as string[] };
    });
    return c.json(out);
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

activityRoutes.delete('/gmail', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const sql = getSql();
    await sql`DELETE FROM gmail_connections WHERE user_id = ${user.id}::uuid`;
    return c.body(null, 204);
  } catch (e) {
    return jsonError(c, e);
  }
});
