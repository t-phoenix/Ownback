import { freeByChain } from '../lib/wallet-sync.js';
import { assetDisplayName } from '../lib/asset-name.js';
import { Hono } from 'hono';
import { z } from 'zod';
import { getSql } from '../db/client.js';
import { ApiError } from '../shared/errors.js';
import { toUsd6 } from '../shared/money.js';
import { jarState } from '../lib/limits.js';
import {
  jsonError,
  mePayload,
  requireCsrf,
  requireUser,
} from '../lib/http.js';
import { newId } from '../lib/ids.js';

export const meRulesHomeRoutes = new Hono();

async function onboarded(userId: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql<{ onboarded_at: Date | null }[]>`
    SELECT onboarded_at FROM rules WHERE user_id = ${userId}::uuid
  `;
  return !!rows[0]?.onboarded_at;
}

function rulesJson(r: {
  rate_bps: number;
  monthly_cap_usd6: bigint;
  ready_min_usd6: bigint;
  max_fee_bps: number;
  auto_add: unknown;
  fallback_asset: string;
  split_maker: number;
  split_behind: number;
  split_materials: number;
  buy_day: string;
  onchain_synced_at: Date | null;
}) {
  return {
    rateBps: r.rate_bps,
    monthlyCapUsd6: toUsd6(BigInt(r.monthly_cap_usd6)),
    readyMinUsd6: toUsd6(BigInt(r.ready_min_usd6)),
    maxFeeBps: r.max_fee_bps,
    autoAdd: r.auto_add,
    fallbackAsset: r.fallback_asset,
    split: { maker: r.split_maker, behind: r.split_behind, materials: r.split_materials },
    buyDay: r.buy_day,
    onchainSynced: !!r.onchain_synced_at,
  };
}

meRulesHomeRoutes.get('/me', async (c) => {
  try {
    const user = await requireUser(c);
    return c.json(mePayload(user, await onboarded(user.id)));
  } catch (e) {
    return jsonError(c, e);
  }
});

meRulesHomeRoutes.get('/rules', async (c) => {
  try {
    const user = await requireUser(c);
    const sql = getSql();
    const rows = await sql<Parameters<typeof rulesJson>[0][]>`
      SELECT * FROM rules WHERE user_id = ${user.id}::uuid
    `;
    if (!rows[0]) throw new ApiError('NOT_FOUND');
    return c.json(rulesJson(rows[0]));
  } catch (e) {
    return jsonError(c, e);
  }
});

const rulesPatch = z.object({
  rateBps: z.number().int().min(200).max(1000).optional(),
  monthlyCapUsd6: z.string().regex(/^\d+$/).optional(),
  readyMinUsd6: z.string().regex(/^\d+$/).optional(),
  maxFeeBps: z.number().int().min(50).max(1000).optional(),
  autoAdd: z
    .record(
      z.enum(['ethereum', 'base', 'arbitrum']),
      z.object({ on: z.boolean(), capUsd6: z.string().regex(/^\d+$/) }),
    )
    .optional(),
  fallbackAsset: z
    .enum(['idx:sp500', 'idx:nasdaq100', 'mat:gold', 'crypto:btc', 'crypto:eth', 'idx:tbills'])
    .optional(),
  split: z
    .object({
      maker: z.number().int(),
      behind: z.number().int(),
      materials: z.number().int(),
    })
    .refine((s) => s.maker + s.behind + s.materials === 100, 'split must sum to 100')
    .optional(),
  buyDay: z.literal('sun').optional(),
});

meRulesHomeRoutes.put('/rules', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const body = rulesPatch.parse(await c.req.json());
    if (body.readyMinUsd6) {
      const n = BigInt(body.readyMinUsd6);
      if (n < 1_000_000n || n > 50_000_000n) {
        throw new ApiError('VALIDATION', { issues: [{ path: 'readyMinUsd6', message: '$1–$50' }] });
      }
    }
    const sql = getSql();
    const cur = await sql`SELECT * FROM rules WHERE user_id = ${user.id}::uuid`;
    if (!cur[0]) throw new ApiError('NOT_FOUND');

    const rate = body.rateBps ?? cur[0].rate_bps;
    const cap = body.monthlyCapUsd6 ? BigInt(body.monthlyCapUsd6) : (cur[0].monthly_cap_usd6 as bigint);
    const ready = body.readyMinUsd6 ? BigInt(body.readyMinUsd6) : (cur[0].ready_min_usd6 as bigint);
    const fee = body.maxFeeBps ?? cur[0].max_fee_bps;
    const fallback = body.fallbackAsset ?? cur[0].fallback_asset;
    const buyDay = body.buyDay ?? cur[0].buy_day;
    const sm = body.split?.maker ?? cur[0].split_maker;
    const sb = body.split?.behind ?? cur[0].split_behind;
    const smat = body.split?.materials ?? cur[0].split_materials;
    const autoAdd = body.autoAdd ?? cur[0].auto_add;

    await sql`
      UPDATE rules SET
        rate_bps = ${rate},
        monthly_cap_usd6 = ${cap.toString()}::bigint,
        ready_min_usd6 = ${ready.toString()}::bigint,
        max_fee_bps = ${fee},
        fallback_asset = ${fallback},
        buy_day = ${buyDay},
        split_maker = ${sm},
        split_behind = ${sb},
        split_materials = ${smat},
        auto_add = ${sql.json(autoAdd as never)},
        onchain_synced_at = NULL,
        onboarded_at = COALESCE(onboarded_at, now()),
        updated_at = now()
      WHERE user_id = ${user.id}::uuid
    `;
    await sql`
      INSERT INTO events (id, user_id, kind, payload, link, created_at)
      VALUES (${newId()}::uuid, ${user.id}::uuid, 'rules_changed', '{}'::jsonb, '/settings', now())
    `;
    const rows = await sql<Parameters<typeof rulesJson>[0][]>`
      SELECT * FROM rules WHERE user_id = ${user.id}::uuid
    `;
    return c.json(rulesJson(rows[0]!));
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

meRulesHomeRoutes.get('/home', async (c) => {
  try {
    const user = await requireUser(c);
    const sql = getSql();
    const stats = await sql<{ receipts: number; spending: bigint | null; jars: bigint | null }[]>`
      SELECT
        COUNT(*)::int AS receipts,
        COALESCE(SUM(amount_usd6), 0) AS spending,
        COALESCE(SUM(invest_usd6) FILTER (WHERE status = 'saved'), 0) AS jars
      FROM purchases
      WHERE user_id = ${user.id}::uuid AND status NOT IN ('deleted', 'read_failed', 'skipped')
    `;
    // Live Arc wallet (side-effect: records new deposits). Jars are still USDC in that wallet under MOCK.
    const funds = await freeByChain(user);
    const chainMap: Record<string, string> = {
      arc: '0',
      solana: '0',
      base: '0',
      ethereum: '0',
      arbitrum: '0',
      bnb: '0',
    };
    for (const [chain, amount] of Object.entries(funds.byChain)) chainMap[chain] = toUsd6(amount);
    const free = funds.total;
    // postgres.js returns int8 as string — coerce before bigint math (freeByChain already does).
    const inJars = BigInt(stats[0]?.jars ?? 0);
    const bought = await sql<{ spent: bigint | string }[]>`
      SELECT COALESCE(SUM(spent_usd6), 0) AS spent FROM buy_entries
      WHERE user_id = ${user.id}::uuid AND status = 'bought'
    `;
    const owned = BigInt(bought[0]?.spent ?? 0);
    // Wallet still holds buy USDC under MOCK — show dollars as free − owned so total stays the live balance.
    const dollars = free > owned ? free - owned : 0n;
    const rules = await sql<{ ready_min_usd6: bigint | string }[]>`
      SELECT ready_min_usd6 FROM rules WHERE user_id = ${user.id}::uuid
    `;
    const readyMin = BigInt(rules[0]?.ready_min_usd6 ?? 5_000_000);
    const jars = await sql<{ asset_id: string; amt: bigint | string }[]>`
      SELECT a.asset_id, COALESCE(SUM(a.saved_usd6 - a.bought_usd6), 0) AS amt
      FROM allocations a
      JOIN purchases p ON p.id = a.purchase_id
      WHERE p.user_id = ${user.id}::uuid AND p.status = 'saved'
      GROUP BY a.asset_id
    `;
    const readyJars = jars.filter((j) => jarState(BigInt(j.amt), readyMin) === 'ready').length;
    const topHoldings = await sql<{ asset_id: string; spent: bigint; qty: string | null }[]>`
      SELECT asset_id, COALESCE(SUM(spent_usd6), 0) AS spent, MAX(qty)::text AS qty
      FROM buy_entries WHERE user_id = ${user.id}::uuid AND status = 'bought'
      GROUP BY asset_id ORDER BY spent DESC LIMIT 3
    `;

    const recent = await sql<
      {
        id: string;
        shop: string | null;
        amount_usd6: bigint | null;
        invest_usd6: bigint | null;
        purchased_on: string | null;
        status: string;
        items: unknown;
      }[]
    >`
      SELECT id, shop, amount_usd6, invest_usd6, purchased_on::text, status, items
      FROM purchases
      WHERE user_id = ${user.id}::uuid AND status NOT IN ('deleted', 'read_failed')
      ORDER BY created_at DESC LIMIT 2
    `;

    return c.json({
      balance: {
        totalUsd6: toUsd6(dollars + owned),
        byType: {
          stocksCommodities: toUsd6(owned),
          stablecoins: toUsd6(dollars),
          crypto: '0',
        },
        byChain: chainMap,
        pricesAt: new Date().toISOString(),
        stale: false,
        usdc: {
          freeUsd6: toUsd6(dollars),
          inJarsUsd6: toUsd6(inJars),
          arrivingUsd6: toUsd6(funds.arriving),
        },
      },
      stats: {
        receipts: stats[0]?.receipts ?? 0,
        spendingUsd6: toUsd6(BigInt(stats[0]?.spending ?? 0)),
        inJarsUsd6: toUsd6(inJars),
      },
      topHoldings: topHoldings.map((h) => ({
        assetId: h.asset_id,
        name: assetDisplayName(h.asset_id),
        subtitle: h.qty ? `${h.qty} bought` : 'Bought',
        ...(h.qty ? { qty: h.qty } : {}),
        valueUsd6: toUsd6(BigInt(h.spent)),
      })),
      recentReceipts: recent.map((r) => {
        const items = Array.isArray(r.items) ? (r.items as { name?: string }[]) : [];
        return {
          id: r.id,
          shop: r.shop ?? '',
          item: items[0]?.name ?? '',
          local: { amount: '0', currency: 'USD' },
          amountUsd6: toUsd6(BigInt(r.amount_usd6 ?? 0)),
          date: r.purchased_on ?? '',
          status: r.status === 'needs_review' ? 'needs_review' : r.status === 'saved' ? 'in_jar' : 'needs_review',
          investUsd6: toUsd6(BigInt(r.invest_usd6 ?? 0)),
        };
      }),
      nextBuy: {
        at: nextSundayIstIso(),
        readyJars,
      },
    });
  } catch (e) {
    return jsonError(c, e);
  }
});

function nextSundayIstIso(): string {
  // Sun 10:00 IST = Sun 04:30 UTC
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 4, 30, 0));
  const day = d.getUTCDay();
  const add = (7 - day) % 7 || (now >= d ? 7 : 0);
  if (day === 0 && now < d) return d.toISOString();
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString();
}

meRulesHomeRoutes.get('/wallet', async (c) => {
  try {
    const user = await requireUser(c);
    const sql = getSql();
    const jarRows = await sql<{ amount: bigint }[]>`
      SELECT COALESCE(SUM(a.saved_usd6 - a.bought_usd6), 0) AS amount
      FROM allocations a JOIN purchases p ON p.id = a.purchase_id
      WHERE p.user_id = ${user.id}::uuid AND p.status = 'saved'
    `;
    const free = (await freeByChain(user)).total;
    const jars = BigInt(jarRows[0]?.amount ?? 0);
    // Jars are still Arc USDC under MOCK — total is the live wallet, not free+jars.
    return c.json({
      vault: {
        inJarsUsd6: toUsd6(jars),
        freeUsd6: toUsd6(free > jars ? free - jars : 0n),
        totalUsd6: toUsd6(free),
      },
      evmAddress: user.evmAddress,
      solAddress: user.solAddress,
      signIn: { kind: user.authKind, ...(user.email ? { email: user.email } : {}) },
    });
  } catch (e) {
    return jsonError(c, e);
  }
});

meRulesHomeRoutes.get('/me/export', async (c) => {
  try {
    const user = await requireUser(c);
    const sql = getSql();
    const purchases = await sql`SELECT * FROM purchases WHERE user_id = ${user.id}::uuid`;
    const events = await sql`SELECT kind, payload, link, created_at FROM events WHERE user_id = ${user.id}::uuid`;
    return c.json({
      user: mePayload(user, await onboarded(user.id)),
      purchases,
      events,
      exportedAt: new Date().toISOString(),
      note: 'fields_only; no images, audio, or email bodies',
    });
  } catch (e) {
    return jsonError(c, e);
  }
});
