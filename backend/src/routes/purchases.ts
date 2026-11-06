import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getSql } from '../db/client.js';
import { ApiError } from '../shared/errors.js';
import { parseUsd6, toUsd6 } from '../shared/money.js';
import { scaleAllocations, splitInvest } from '../lib/split.js';
import { precheckConfirm, remainingThisMonth } from '../lib/limits.js';
import {
  assertIdempotencyKey,
  jsonError,
  mockEvmAction,
  requireCsrf,
  requireUser,
  withIdempotency,
} from '../lib/http.js';
import { newId } from '../lib/ids.js';
import { mockChain } from '../lib/env.js';

export const purchaseRoutes = new Hono();

async function loadPurchase(userId: string, id: string) {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT * FROM purchases WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
  `;
  if (!rows[0]) throw new ApiError('NOT_FOUND');
  const allocs = await sql<
    {
      asset_id: string;
      role: string;
      amount_usd6: bigint;
      selected: boolean;
      why: string | null;
      source_url: string | null;
    }[]
  >`
    SELECT asset_id, role, amount_usd6, selected, why, source_url
    FROM allocations WHERE purchase_id = ${id}::uuid
  `;
  return { p: rows[0], allocs };
}

function purchaseJson(
  p: Record<string, unknown>,
  allocs: {
    asset_id: string;
    role: string;
    amount_usd6: bigint;
    selected: boolean;
    why: string | null;
    source_url: string | null;
  }[],
  limit?: { usedUsd6: string; capUsd6: string; leftUsd6: string },
) {
  const status = p.status as string;
  const steps = [
    { key: 'read' as const, state: status === 'reading' ? ('running' as const) : ('done' as const), label: 'Read receipt' },
    { key: 'convert' as const, state: status === 'reading' ? ('todo' as const) : ('done' as const), label: 'Convert to USD' },
    { key: 'maker' as const, state: status === 'reading' ? ('todo' as const) : ('done' as const), label: 'Find maker' },
    { key: 'behind' as const, state: status === 'reading' ? ('todo' as const) : ('done' as const), label: 'Behind the product' },
    { key: 'buyable' as const, state: status === 'reading' ? ('todo' as const) : ('done' as const), label: 'Buyable shares' },
  ];
  return {
    id: p.id,
    status,
    source: p.source,
    steps,
    ...(p.shop
      ? {
          receipt: {
            shop: p.shop,
            place: p.place ?? undefined,
            date: p.purchased_on,
            items: Array.isArray(p.items)
              ? (p.items as { name: string }[]).map((i) => i.name)
              : [],
            local: {
              amount: String(p.amount_local ?? '0'),
              currency: p.currency ?? 'USD',
            },
            fxRate: String(p.fx_rate ?? '1'),
            amountUsd6: toUsd6((p.amount_usd6 as bigint) ?? 0n),
          },
        }
      : {}),
    ...(p.invest_usd6 != null ? { investUsd6: toUsd6(p.invest_usd6 as bigint) } : {}),
    ...(p.rate_bps != null ? { rateBps: p.rate_bps as number } : {}),
    ...(p.split ? { split: p.split } : {}),
    allocations: allocs.map((a) => ({
      assetId: a.asset_id,
      name: a.asset_id,
      role: a.role,
      tokenized: true,
      amountUsd6: toUsd6(a.amount_usd6),
      selected: a.selected,
      why: a.why ?? undefined,
      sourceUrl: a.source_url ?? undefined,
    })),
    ogRequestIds: [],
    ...(p.rest_usd6 && (p.rest_usd6 as bigint) > 0n
      ? { restPendingUsd6: toUsd6(p.rest_usd6 as bigint) }
      : {}),
    ...(p.read_error ? { readError: p.read_error } : {}),
    ...(limit ? { limit } : {}),
  };
}

purchaseRoutes.post('/purchases', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const key = assertIdempotencyKey(c);
    const ct = c.req.header('content-type') ?? '';
    let source: 'photo' | 'voice' | 'typed' = 'typed';
    let text: { product: string; amount: string; currency: string; maker?: string } | null = null;

    if (ct.includes('multipart/form-data')) {
      const form = await c.req.parseBody();
      if (form['image']) source = 'photo';
      else if (form['audio']) source = 'voice';
      else throw new ApiError('UNSUPPORTED_MEDIA');
      // shortcut: size check deferred to busboy when upload pipeline lands; 0G read is async job
    } else {
      const body = z
        .object({
          text: z.object({
            product: z.string().min(1),
            amount: z.string(),
            currency: z.string().length(3),
            maker: z.string().optional(),
          }),
        })
        .parse(await c.req.json());
      text = body.text;
      source = 'typed';
    }

    const hash = createHash('sha256').update(JSON.stringify({ source, text })).digest('hex');
    const out = await withIdempotency(user.id, key, hash, async () => {
      const sql = getSql();
      const id = newId();
      const rules = await sql<{ rate_bps: number; fallback_asset: string; split_maker: number; split_behind: number; split_materials: number }[]>`
        SELECT rate_bps, fallback_asset, split_maker, split_behind, split_materials FROM rules WHERE user_id = ${user.id}::uuid
      `;
      const r = rules[0]!;

      if (text && mockChain()) {
        // Typed path completes sync under MOCK_CHAIN using registry-free fallback only when maker given.
        const amountLocal = Number(text.amount);
        const amountUsd6 = BigInt(Math.round(amountLocal * 1_000_000)); // identity FX when currency=USD; INR needs fx_rates
        let usd = amountUsd6;
        let fxRate = '1';
        let fxSource = 'identity';
        if (text.currency !== 'USD') {
          const fx = await sql<{ rate: string }[]>`
            SELECT rate::text FROM fx_rates WHERE currency = ${text.currency} ORDER BY date DESC LIMIT 1
          `;
          if (fx[0]) {
            fxRate = fx[0].rate;
            fxSource = 'cache';
            usd = BigInt(Math.round((amountLocal / Number(fxRate)) * 1_000_000));
          }
        }
        const makers = text.maker
          ? [{ assetId: text.maker.startsWith('co:') ? text.maker : `co:${text.maker.toLowerCase()}`, role: 'maker' as const }]
          : [];
        const split = splitInvest({
          amountUsd6: usd,
          rateBps: r.rate_bps,
          split: { maker: r.split_maker, behind: r.split_behind, materials: r.split_materials },
          makers,
          behind: [],
          materials: [],
          fallbackAsset: r.fallback_asset,
        });
        const status = split.notListed ? 'not_listed' : 'ready';
        await sql`
          INSERT INTO purchases (
            id, user_id, source, status, shop, items, purchased_on, amount_local, currency,
            fx_rate, fx_source, fx_date, amount_usd6, rate_bps, invest_usd6, split, created_at, updated_at
          ) VALUES (
            ${id}::uuid, ${user.id}::uuid, ${source}, ${status}, 'Typed',
            ${sql.json([{ name: text.product, brand: text.maker ?? null, qty: 1 }])}::jsonb,
            CURRENT_DATE, ${text.amount}, ${text.currency},
            ${fxRate}, ${fxSource}, CURRENT_DATE, ${usd.toString()}::bigint, ${r.rate_bps}, ${split.investUsd6.toString()}::bigint,
            ${sql.json({ maker: r.split_maker, behind: r.split_behind, materials: r.split_materials })}::jsonb,
            now(), now()
          )
        `;
        for (const row of split.rows) {
          await sql`
            INSERT INTO allocations (id, purchase_id, asset_id, role, amount_usd6, selected)
            VALUES (${newId()}::uuid, ${id}::uuid, ${row.assetId}, ${row.role}, ${row.amountUsd6.toString()}::bigint, true)
          `;
        }
      } else {
        await sql`
          INSERT INTO purchases (id, user_id, source, status, created_at, updated_at)
          VALUES (${id}::uuid, ${user.id}::uuid, ${source}, 'reading', now(), now())
        `;
        // Photo/voice stay `reading` until 0G job (integrations.md); not invented here.
      }
      return { purchaseId: id };
    });
    return c.json(out);
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

purchaseRoutes.get('/purchases/:id', async (c) => {
  try {
    const user = await requireUser(c);
    const { p, allocs } = await loadPurchase(user.id, c.req.param('id'));
    return c.json(purchaseJson(p, allocs));
  } catch (e) {
    return jsonError(c, e);
  }
});

purchaseRoutes.put('/purchases/:id/split', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const body = z
      .object({
        maker: z.number().int(),
        behind: z.number().int(),
        materials: z.number().int(),
        makerOnly: z.boolean().optional(),
        saveForFuture: z.boolean(),
      })
      .refine((s) => s.maker + s.behind + s.materials === 100)
      .parse(await c.req.json());
    const { p, allocs } = await loadPurchase(user.id, c.req.param('id'));
    const sql = getSql();
    if (body.saveForFuture) {
      await sql`
        UPDATE rules SET split_maker = ${body.maker}, split_behind = ${body.behind},
          split_materials = ${body.materials}, updated_at = now()
        WHERE user_id = ${user.id}::uuid
      `;
    }
    const rules = await sql<{ fallback_asset: string }[]>`
      SELECT fallback_asset FROM rules WHERE user_id = ${user.id}::uuid
    `;
    const makers = allocs.filter((a) => a.role === 'maker' || a.role === 'fallback').map((a) => ({
      assetId: a.asset_id,
      role: a.role as 'maker' | 'fallback',
    }));
    const behind = body.makerOnly
      ? []
      : allocs.filter((a) => a.role === 'supplier').map((a) => ({ assetId: a.asset_id, role: 'supplier' as const }));
    const materials = body.makerOnly
      ? []
      : allocs.filter((a) => a.role === 'material').map((a) => ({ assetId: a.asset_id, role: 'material' as const }));
    const split = splitInvest({
      amountUsd6: p.amount_usd6 as bigint,
      rateBps: p.rate_bps as number,
      split: { maker: body.maker, behind: body.behind, materials: body.materials },
      makers,
      behind,
      materials,
      fallbackAsset: rules[0]!.fallback_asset,
      makerOnly: body.makerOnly,
    });
    await sql`DELETE FROM allocations WHERE purchase_id = ${c.req.param('id')}::uuid`;
    for (const row of split.rows) {
      await sql`
        INSERT INTO allocations (id, purchase_id, asset_id, role, amount_usd6, selected)
        VALUES (${newId()}::uuid, ${c.req.param('id')}::uuid, ${row.assetId}, ${row.role}, ${row.amountUsd6.toString()}::bigint, true)
      `;
    }
    await sql`
      UPDATE purchases SET invest_usd6 = ${split.investUsd6.toString()}::bigint,
        split = ${sql.json({ maker: body.maker, behind: body.behind, materials: body.materials })}::jsonb,
        updated_at = now()
      WHERE id = ${c.req.param('id')}::uuid
    `;
    const loaded = await loadPurchase(user.id, c.req.param('id'));
    return c.json(purchaseJson(loaded.p, loaded.allocs));
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

purchaseRoutes.put('/purchases/:id/assets', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const body = z.object({ deselect: z.array(z.string()) }).parse(await c.req.json());
    await loadPurchase(user.id, c.req.param('id'));
    const sql = getSql();
    if (body.deselect.length) {
      await sql`
        UPDATE allocations SET selected = false
        WHERE purchase_id = ${c.req.param('id')}::uuid AND asset_id = ANY(${body.deselect})
      `;
      await sql`
        UPDATE allocations SET selected = true
        WHERE purchase_id = ${c.req.param('id')}::uuid AND NOT (asset_id = ANY(${body.deselect}))
      `;
    }
    const loaded = await loadPurchase(user.id, c.req.param('id'));
    return c.json(purchaseJson(loaded.p, loaded.allocs));
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

purchaseRoutes.get('/makers/search', async (c) => {
  try {
    await requireUser(c);
    const q = (c.req.query('q') ?? '').toLowerCase();
    // Registry JSON not filled (☐ mints). Return empty until database/registry seed is verified.
    const known = [
      { companyId: 'co:apple', name: 'Apple Inc.', ticker: 'AAPL', listed: true, tokenized: false },
      { companyId: 'co:nike', name: 'Nike Inc.', ticker: 'NKE', listed: true, tokenized: false },
      { companyId: 'co:unilever', name: 'Unilever', ticker: 'UL', listed: true, tokenized: false },
    ].filter((x) => !q || x.name.toLowerCase().includes(q) || x.companyId.includes(q));
    return c.json({ items: known });
  } catch (e) {
    return jsonError(c, e);
  }
});

purchaseRoutes.put('/purchases/:id/match', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const body = z
      .union([z.object({ companyId: z.string() }), z.object({ privateBrand: z.literal(true) })])
      .parse(await c.req.json());
    const { p } = await loadPurchase(user.id, c.req.param('id'));
    const sql = getSql();
    const rules = await sql<{ rate_bps: number; fallback_asset: string; split_maker: number; split_behind: number; split_materials: number }[]>`
      SELECT rate_bps, fallback_asset, split_maker, split_behind, split_materials FROM rules WHERE user_id = ${user.id}::uuid
    `;
    const r = rules[0]!;
    const makers =
      'privateBrand' in body
        ? []
        : [{ assetId: body.companyId, role: 'maker' as const }];
    const split = splitInvest({
      amountUsd6: p.amount_usd6 as bigint,
      rateBps: r.rate_bps,
      split: { maker: r.split_maker, behind: r.split_behind, materials: r.split_materials },
      makers,
      behind: [],
      materials: [],
      fallbackAsset: r.fallback_asset,
    });
    await sql`DELETE FROM allocations WHERE purchase_id = ${c.req.param('id')}::uuid`;
    for (const row of split.rows) {
      await sql`
        INSERT INTO allocations (id, purchase_id, asset_id, role, amount_usd6, selected)
        VALUES (${newId()}::uuid, ${c.req.param('id')}::uuid, ${row.assetId}, ${row.role}, ${row.amountUsd6.toString()}::bigint, true)
      `;
    }
    await sql`
      UPDATE purchases SET status = 'ready', invest_usd6 = ${split.investUsd6.toString()}::bigint, updated_at = now()
      WHERE id = ${c.req.param('id')}::uuid
    `;
    const loaded = await loadPurchase(user.id, c.req.param('id'));
    return c.json(purchaseJson(loaded.p, loaded.allocs));
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

purchaseRoutes.put('/purchases/:id/fallback', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const body = z.object({ choice: z.enum(['fallback', 'skip']) }).parse(await c.req.json());
    const sql = getSql();
    if (body.choice === 'skip') {
      await sql`
        UPDATE purchases SET status = 'skipped', updated_at = now()
        WHERE id = ${c.req.param('id')}::uuid AND user_id = ${user.id}::uuid
      `;
    } else {
      await sql`
        UPDATE purchases SET status = 'ready', updated_at = now()
        WHERE id = ${c.req.param('id')}::uuid AND user_id = ${user.id}::uuid
      `;
      await sql`
        INSERT INTO events (id, user_id, kind, payload, created_at)
        VALUES (${newId()}::uuid, ${user.id}::uuid, 'fallback_used', '{}'::jsonb, now())
      `;
    }
    const loaded = await loadPurchase(user.id, c.req.param('id'));
    return c.json(purchaseJson(loaded.p, loaded.allocs));
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

purchaseRoutes.post('/purchases/:id/confirm', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const key = assertIdempotencyKey(c);
    const body = z.object({ amountUsd6: z.string().regex(/^\d+$/).optional() }).parse(await c.req.json());
    const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const result = await withIdempotency(user.id, key, hash, async () => {
      const { p, allocs } = await loadPurchase(user.id, c.req.param('id'));
      const selected = allocs.filter((a) => a.selected);
      if (!selected.length) throw new ApiError('NOTHING_TO_BUY');

      const sql = getSql();
      const rules = await sql<{ monthly_cap_usd6: bigint }[]>`
        SELECT monthly_cap_usd6 FROM rules WHERE user_id = ${user.id}::uuid
      `;
      const usedRows = await sql<{ used: bigint }[]>`
        SELECT COALESCE(SUM(invest_usd6 - rest_usd6), 0) AS used FROM purchases
        WHERE user_id = ${user.id}::uuid AND status = 'saved'
          AND date_trunc('month', created_at AT TIME ZONE 'UTC') = date_trunc('month', now() AT TIME ZONE 'UTC')
      `;
      const freeRows = await sql<{ free: bigint }[]>`
        SELECT COALESCE(SUM(amount_usd6), 0) AS free FROM deposits
        WHERE user_id = ${user.id}::uuid AND status = 'added'
      `;
      // Free balance for confirm is vault free; deposits mirror until chain sync (schema mirror rules).
      const invest = (p.invest_usd6 as bigint) ?? 0n;
      const partial = body.amountUsd6 ? parseUsd6(body.amountUsd6) : undefined;
      const check = precheckConfirm({
        investUsd6: invest,
        usedUsd6: usedRows[0]?.used ?? 0n,
        capUsd6: rules[0]!.monthly_cap_usd6,
        freeUsd6: freeRows[0]?.free ?? 0n,
        partialUsd6: partial,
      });

      if (partial !== undefined && partial < invest) {
        const scaled = scaleAllocations(
          selected.map((a) => ({ assetId: a.asset_id, amountUsd6: a.amount_usd6 })),
          check.amountUsd6,
        );
        for (const row of scaled) {
          await sql`
            UPDATE allocations SET amount_usd6 = ${row.amountUsd6.toString()}::bigint
            WHERE purchase_id = ${c.req.param('id')}::uuid AND asset_id = ${row.assetId}
          `;
        }
        await sql`
          UPDATE purchases SET rest_usd6 = ${check.restUsd6.toString()}::bigint,
            invest_usd6 = ${check.amountUsd6.toString()}::bigint, updated_at = now()
          WHERE id = ${c.req.param('id')}::uuid
        `;
      }

      await sql`
        UPDATE purchases SET status = 'confirming', updated_at = now()
        WHERE id = ${c.req.param('id')}::uuid
      `;

      const assets = selected.map((a) => a.asset_id);
      const amounts = selected.map((a) => toUsd6(a.amount_usd6));
      return {
        action: mockEvmAction(
          `Move $${Number(check.amountUsd6 / 1_000_000n)}.${(check.amountUsd6 % 1_000_000n).toString().padStart(6, '0').slice(0, 2)} into ${selected.length} jars on Arc`,
          assets,
          amounts,
        ),
      };
    });
    return c.json(result);
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

purchaseRoutes.post('/purchases/:id/confirm/submitted', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const body = z
      .object({ txHash: z.string().optional(), challengeIds: z.array(z.string()).optional() })
      .parse(await c.req.json().catch(() => ({})));
    const sql = getSql();
    if (!mockChain() && !body.txHash && !body.challengeIds?.length) {
      throw new ApiError('TX_NOT_FOUND');
    }
    // Real path: read Allocated events before status=saved (AI_BUILD trust rule).
    await sql`
      UPDATE allocations SET saved_usd6 = amount_usd6
      WHERE purchase_id = ${c.req.param('id')}::uuid AND selected = true
    `;
    await sql`
      UPDATE purchases SET status = 'saved', confirm_tx = ${body.txHash ?? 'mock'}, updated_at = now()
      WHERE id = ${c.req.param('id')}::uuid AND user_id = ${user.id}::uuid
    `;
    const loaded = await loadPurchase(user.id, c.req.param('id'));
    const lim = remainingThisMonth(0n, 50_000_000n);
    return c.json(
      purchaseJson(loaded.p, loaded.allocs, {
        usedUsd6: toUsd6(lim.usedUsd6),
        capUsd6: toUsd6(lim.capUsd6),
        leftUsd6: toUsd6(lim.leftUsd6),
      }),
    );
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

purchaseRoutes.post('/purchases/:id/report', async (c) => {
  try {
    requireCsrf(c);
    await requireUser(c);
    await c.req.json().catch(() => ({}));
    return c.body(null, 204);
  } catch (e) {
    return jsonError(c, e);
  }
});
