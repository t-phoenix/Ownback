import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getSql } from '../db/client.js';
import { ApiError } from '../shared/errors.js';
import { formatUsd, parseUsd6, toUsd6 } from '../shared/money.js';
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
import { analysePurchase, freshSteps, readPurchase, type ReadInput, type Rules } from '../lib/og/read.js';
import { PurchaseDetails } from '../lib/og/schemas.js';
import { getCatalogCompany } from '../lib/registry/catalog.js';
import { getAsset, iconField, verifiedMint } from '../shared/assets.js';
import { freeByChain } from '../lib/wallet-sync.js';
import { CENT_USD6 } from '../shared/timing.js';

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
  const og = await sql<{ og_request_id: string }[]>`SELECT og_request_id FROM ai_runs WHERE purchase_id = ${id}::uuid AND og_request_id IS NOT NULL ORDER BY created_at`;
  const p: Record<string, unknown> = { ...rows[0], og_request_ids: og.map((r) => r.og_request_id) };
  return { p, allocs };
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
  // Real steps from the worker; legacy rows (before 0006) derive them from the status.
  const steps = (p.steps as ReturnType<typeof freshSteps> | null) ?? freshSteps(status !== 'reading').map((s) => ({ ...s, state: status === 'reading' ? s.state : ('done' as const) }));
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
    ...(p.details ? { details: p.details } : {}),
    ...(p.analysis ? { analysis: p.analysis } : {}),
    ...(p.invest_usd6 != null ? { investUsd6: toUsd6(p.invest_usd6 as bigint) } : {}),
    ...(p.rate_bps != null ? { rateBps: p.rate_bps as number } : {}),
    ...(p.split ? { split: p.split } : {}),
    allocations: allocs.map((a) => {
      const cat = getCatalogCompany(a.asset_id);
      const buyable = Boolean(verifiedMint(a.asset_id, 'solana'));
      return {
        assetId: a.asset_id,
        name: getAsset(a.asset_id)?.name ?? cat?.name ?? a.asset_id,
        ...iconField(a.asset_id),
        role: a.role,
        tokenized: buyable || Boolean(cat?.tokenized),
        verifiedBuyable: buyable,
        venue: buyable ? 'jupiter' : undefined,
        token: buyable ? verifiedMint(a.asset_id, 'solana')?.symbol : cat?.tokens[0]?.symbol,
        chain: buyable ? 'solana' : cat?.tokens[0]?.chain,
        amountUsd6: toUsd6(a.amount_usd6),
        selected: a.selected,
        why: a.why ?? undefined,
        sourceUrl: a.source_url ?? undefined,
      };
    }),
    ogRequestIds: (p.og_request_ids as string[] | undefined) ?? [],
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
    let text: { product: string; amount: string; currency: string; maker?: string; model?: string; shop?: string; date?: string } | null = null;

    let media: File | null = null;
    if (ct.includes('multipart/form-data')) {
      const form = await c.req.parseBody();
      const image = form['image'], audio = form['audio'];
      if (image instanceof File) { source = 'photo'; media = image; }
      else if (audio instanceof File) { source = 'voice'; media = audio; }
      else throw new ApiError('UNSUPPORTED_MEDIA');
      if (media.size > 8 * 1024 * 1024) throw new ApiError('UPLOAD_TOO_LARGE');
      const okType = source === 'photo' ? /^image\/(jpeg|png|webp|heic|heif)$/ : /^audio\//;
      if (!okType.test(media.type)) throw new ApiError('UNSUPPORTED_MEDIA');
    } else {
      const body = z
        .object({
          text: z.object({
            product: z.string().min(1),
            amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
            currency: z.string().length(3),
            maker: z.string().max(80).optional(),
            model: z.string().max(80).optional(),
            shop: z.string().max(120).optional(),
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          }),
        })
        .parse(await c.req.json());
      text = body.text;
      source = 'typed';
    }

    const mediaBytes = media ? Buffer.from(await media.arrayBuffer()) : null;
    const hash = createHash('sha256').update(JSON.stringify({ source, text })).update(mediaBytes ?? Buffer.alloc(0)).digest('hex');
    const out = await withIdempotency(user.id, key, hash, async () => {
      const sql = getSql();
      const id = newId();
      const rules = await sql<{ rate_bps: number; fallback_asset: string; split_maker: number; split_behind: number; split_materials: number }[]>`
        SELECT rate_bps, fallback_asset, split_maker, split_behind, split_materials FROM rules WHERE user_id = ${user.id}::uuid
      `;
      const r = rules[0]!;

      await sql`
        INSERT INTO purchases (id, user_id, source, status, steps, created_at, updated_at)
        VALUES (${id}::uuid, ${user.id}::uuid, ${source}, 'reading', ${sql.json(freshSteps())}::jsonb, now(), now())
      `;
      const input: ReadInput =
        source === 'photo'
          ? { kind: 'image', dataUrl: `data:${media!.type};base64,${mediaBytes!.toString('base64')}` }
          : source === 'voice'
            ? { kind: 'audio', file: new Blob([mediaBytes!], { type: media!.type }), filename: media!.name || 'note.webm' }
            : { kind: 'typed', ...text! };
      // D30: answer now, read + jury after the response. The client polls GET /purchases/:id for real steps.
      // shortcut: in-process setImmediate dies with the process; the reaper in /jobs/rest-pending fails rows stuck > 5 min. Upgrade to a queue if hosts freeze after the response.
      setImmediate(() => void readPurchase(id, user.id, r, input).catch((e) => console.error('read', id, e)));
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
    if (p.status === 'reading' || p.status === 'read_failed' || p.status === 'needs_details' || p.amount_usd6 == null || p.rate_bps == null) {
      throw new ApiError('VALIDATION', { reason: 'purchase_not_ready_for_split' });
    }
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
    await writeAllocations(c.req.param('id'), split.rows, whyByAsset(allocs, p.analysis));
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
    // [] means "everything selected" (it used to do nothing, so the last unticked box stuck).
    await sql`
      UPDATE allocations SET selected = NOT (asset_id = ANY(${body.deselect}))
      WHERE purchase_id = ${c.req.param('id')}::uuid
    `;
    const loaded = await loadPurchase(user.id, c.req.param('id'));
    return c.json(purchaseJson(loaded.p, loaded.allocs));
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

/** why per asset: current allocations first, then the jury rows (so /split and /match never drop it). */
function whyByAsset(allocs: { asset_id: string; why: string | null }[], analysis: unknown): Map<string, string> {
  const m = new Map<string, string>();
  const a = analysis as { parent?: { assetId?: string; why: string } | null; enablers?: { assetId?: string; why: string }[]; commodities?: { assetId?: string; why: string }[] } | null;
  for (const r of [a?.parent, ...(a?.enablers ?? []), ...(a?.commodities ?? [])]) if (r?.assetId) m.set(r.assetId, r.why);
  for (const x of allocs) if (x.why) m.set(x.asset_id, x.why);
  return m;
}

async function writeAllocations(purchaseId: string, rows: { assetId: string; role: string; amountUsd6: bigint }[], why: Map<string, string>) {
  const sql = getSql();
  await sql`DELETE FROM allocations WHERE purchase_id = ${purchaseId}::uuid`;
  for (const row of rows) {
    await sql`
      INSERT INTO allocations (id, purchase_id, asset_id, role, amount_usd6, selected, why)
      VALUES (${newId()}::uuid, ${purchaseId}::uuid, ${row.assetId}, ${row.role}, ${row.amountUsd6.toString()}::bigint, true, ${why.get(row.assetId) ?? null})
    `;
  }
}

/** "Check the details" form (needs_details, or editing a read). Re-runs the jury; never re-reads the image. */
purchaseRoutes.put('/purchases/:id/details', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const body = PurchaseDetails.parse(await c.req.json());
    const id = c.req.param('id');
    const { p } = await loadPurchase(user.id, id);
    if (!['needs_details', 'ready', 'needs_review', 'not_listed', 'read_failed'].includes(p.status as string)) {
      throw new ApiError('VALIDATION', { reason: 'purchase_locked', status: p.status });
    }
    const sql = getSql();
    const rules = await sql<Rules[]>`
      SELECT rate_bps, fallback_asset, split_maker, split_behind, split_materials FROM rules WHERE user_id = ${user.id}::uuid
    `;
    const steps = freshSteps(true);
    await sql`
      UPDATE purchases SET status = 'reading', read_error = NULL, steps = ${sql.json(steps)}::jsonb,
        details = ${sql.json({ ...body, missing: [] } as never)}::jsonb, shop = ${body.merchant ?? null}, updated_at = now()
      WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid
    `;
    // The user typed these, so the read confidence is 1.
    setImmediate(() =>
      void analysePurchase(id, user.id, rules[0]!, body, 1).catch(async (e) => {
        console.error('analyse', id, e);
        await sql`UPDATE purchases SET status = 'read_failed', read_error = 'og_unavailable', updated_at = now() WHERE id = ${id}::uuid`;
      }),
    );
    const loaded = await loadPurchase(user.id, id);
    return c.json(purchaseJson(loaded.p, loaded.allocs));
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

purchaseRoutes.get('/makers/search', async (c) => {
  try {
    await requireUser(c);
    const { searchCompanies } = await import('../lib/registry/catalog.js');
    const q = c.req.query('q') ?? '';
    const items = searchCompanies(q, 30).map((x) => ({
      companyId: x.assetId,
      name: x.name,
      ticker: x.ticker ?? undefined,
      listed: x.listed,
      tokenized: x.tokenized,
      verifiedBuyable: x.verifiedBuyable,
    }));
    return c.json({ items });
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
    const { p, allocs } = await loadPurchase(user.id, c.req.param('id'));
    if (p.amount_usd6 == null) throw new ApiError('VALIDATION', { reason: 'purchase_not_ready_for_match' });
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
    const why = whyByAsset(allocs, p.analysis);
    if ('companyId' in body && !why.has(body.companyId)) why.set(body.companyId, 'You picked this company as the maker.');
    await writeAllocations(c.req.param('id'), split.rows, why);
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
      // Live Arc free (same source as /home); floor to whole cents for D18 partials.
      const freeLive = (await freeByChain(user)).total;
      const freeUsd6 = (freeLive / CENT_USD6) * CENT_USD6;
      const invest = BigInt(p.invest_usd6 != null ? String(p.invest_usd6) : '0');
      const partial = body.amountUsd6 ? parseUsd6(body.amountUsd6) : undefined;
      const check = precheckConfirm({
        investUsd6: invest,
        freeUsd6,
        partialUsd6: partial,
      });

      let payRows = selected.map((a) => ({
        assetId: a.asset_id,
        amountUsd6: BigInt(a.amount_usd6),
      }));
      if (partial !== undefined && partial < invest) {
        payRows = scaleAllocations(payRows, check.amountUsd6);
        for (const row of payRows) {
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

      const assets = payRows.map((a) => a.assetId);
      const amounts = payRows.map((a) => toUsd6(a.amountUsd6));
      return {
        action: mockEvmAction(
          `Save ${formatUsd(toUsd6(check.amountUsd6))} into ${selected.length} jars`,
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
    // D29: jars are reservations against the user's own balance; money moves only when a buy is signed.
    await sql`
      UPDATE allocations SET saved_usd6 = amount_usd6
      WHERE purchase_id = ${c.req.param('id')}::uuid AND selected = true
    `;
    await sql`
      UPDATE purchases SET status = 'saved', confirm_tx = ${body.txHash ?? null}, updated_at = now()
      WHERE id = ${c.req.param('id')}::uuid AND user_id = ${user.id}::uuid
    `;
    const loaded = await loadPurchase(user.id, c.req.param('id'));
    const [lr] = await sql<{ cap: bigint; used: bigint }[]>`
      SELECT r.monthly_cap_usd6 AS cap, COALESCE((SELECT SUM(invest_usd6 - rest_usd6) FROM purchases
        WHERE user_id = ${user.id}::uuid AND status = 'saved'
          AND date_trunc('month', created_at AT TIME ZONE 'UTC') = date_trunc('month', now() AT TIME ZONE 'UTC')), 0) AS used
      FROM rules r WHERE r.user_id = ${user.id}::uuid
    `;
    const lim = remainingThisMonth(BigInt(lr?.used ?? 0), BigInt(lr?.cap ?? 50_000_000n));
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
