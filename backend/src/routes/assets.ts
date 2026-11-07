import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { ApiError } from '../shared/errors.js';
import { jsonError } from '../lib/http.js';
import { requireCron } from '../lib/env.js';
import { canPromote, threeSourceOk } from '../lib/registry/gate.js';
import { readOnchainDecimals } from '../lib/registry/onchain.js';
import { promoteCandidate } from '../lib/registry/promote.js';
import { scrapeXstocksFeatured } from '../lib/registry/scrape-xstocks.js';
import {
  catalogMeta,
  listCatalogCompanies,
  listCatalogTokens,
  searchCompanies,
} from '../lib/registry/catalog.js';
import {
  getCandidate,
  listVerifiedAssets,
  loadCandidates,
  updateCandidate,
  upsertCandidate,
} from '../lib/registry/store.js';
import type { MintEvidence } from '../lib/registry/types.js';

export const assetRoutes = new Hono();

assetRoutes.get('/catalog', (c) => {
  try {
    const meta = catalogMeta();
    return c.json({
      meta,
      storage: meta?.storage ?? null,
      companies: listCatalogCompanies().length,
      tokens: listCatalogTokens().length,
      buyable: listVerifiedAssets().length,
    });
  } catch (e) {
    return jsonError(c, e);
  }
});

assetRoutes.get('/catalog/companies', (c) => {
  try {
    const q = c.req.query('q') ?? '';
    const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);
    const items = (q ? searchCompanies(q, limit) : listCatalogCompanies().slice(0, limit)).map((x) => ({
      assetId: x.assetId,
      name: x.name,
      ticker: x.ticker,
      class: x.class,
      tokenized: x.tokenized,
      verifiedBuyable: x.verifiedBuyable,
      aliases: x.aliases,
      tokens: x.tokens,
    }));
    return c.json({ items });
  } catch (e) {
    return jsonError(c, e);
  }
});

assetRoutes.get('/catalog/tokens', (c) => {
  try {
    const chain = c.req.query('chain') || undefined;
    const issuer = c.req.query('issuer') || undefined;
    const status = c.req.query('status') || undefined;
    const limit = Math.min(Number(c.req.query('limit') ?? 100), 500);
    const items = listCatalogTokens({ chain, issuer, status }).slice(0, limit);
    return c.json({ items, total: listCatalogTokens({ chain, issuer, status }).length });
  } catch (e) {
    return jsonError(c, e);
  }
});

const evidenceSchema = z.object({
  kind: z.enum(['issuer', 'index', 'onchain']),
  url: z.string().url().or(z.string().min(3)),
  note: z.string().min(3),
  checkedAt: z.string().optional(),
});

const proposeSchema = z.object({
  assetId: z.string().min(3),
  name: z.string().min(1),
  class: z.enum(['stock', 'commodity', 'index', 'crypto', 'yield']),
  chain: z.enum(['solana', 'ethereum', 'base', 'arbitrum']),
  symbol: z.string().min(1),
  mint: z.string().min(8),
  decimals: z.number().int().nonnegative().optional(),
  issuer: z.string().min(1),
  venues: z.array(z.string()).default([]),
  evidence: z.array(evidenceSchema).default([]),
  source: z.enum(['scrape', 'ai', 'manual']).default('ai'),
});

assetRoutes.get('/assets', (c) => {
  try {
    const assets = listVerifiedAssets().map((a) => ({
      assetId: a.assetId,
      name: a.name,
      class: a.class,
      mints: a.mints.filter((m) => m.verified),
    }));
    return c.json({ assets });
  } catch (e) {
    return jsonError(c, e);
  }
});

assetRoutes.get('/assets/candidates', (c) => {
  try {
    return c.json(loadCandidates());
  } catch (e) {
    return jsonError(c, e);
  }
});

assetRoutes.post('/assets/candidates', async (c) => {
  try {
    // AI / ops: cron secret or open in mock (MOCK_CHAIN) for local propose
    const auth = c.req.header('authorization');
    if (process.env.MOCK_CHAIN !== '1' && process.env.MOCK_CHAIN !== 'true') {
      try {
        requireCron(auth);
      } catch {
        throw new ApiError('UNAUTHENTICATED');
      }
    }
    const body = proposeSchema.parse(await c.req.json());
    if (body.mint.includes('☐')) throw new ApiError('VALIDATION', { issues: [{ message: 'mint placeholder' }] });
    const day = new Date().toISOString().slice(0, 10);
    const evidence: MintEvidence[] = body.evidence.map((e) => ({
      ...e,
      checkedAt: e.checkedAt ?? day,
    }));
    const now = new Date().toISOString();
    const candidate = upsertCandidate({
      id: randomUUID(),
      assetId: body.assetId,
      name: body.name,
      class: body.class,
      chain: body.chain,
      symbol: body.symbol,
      mint: body.mint,
      decimals: body.decimals,
      issuer: body.issuer,
      venues: body.venues,
      evidence,
      source: body.source,
      status: 'proposed',
      createdAt: now,
      updatedAt: now,
    });
    return c.json({
      candidate,
      threeSource: threeSourceOk(candidate.evidence),
      promoteReady: canPromote(candidate).ok,
    });
  } catch (e) {
    if (e instanceof z.ZodError) return jsonError(c, new ApiError('VALIDATION', { issues: e.issues }));
    return jsonError(c, e);
  }
});

assetRoutes.post('/assets/candidates/:id/verify', async (c) => {
  try {
    const id = c.req.param('id');
    const cand = getCandidate(id);
    if (!cand) throw new ApiError('NOT_FOUND');
    const decimals = await readOnchainDecimals(cand.chain, cand.mint);
    const day = new Date().toISOString().slice(0, 10);
    const evidence = [
      ...cand.evidence.filter((e) => e.kind !== 'onchain'),
      {
        kind: 'onchain' as const,
        url: `${cand.chain}:getTokenSupply|decimals`,
        note: `decimals=${decimals}`,
        checkedAt: day,
      },
    ];
    const updated = updateCandidate(id, {
      onchainDecimals: decimals,
      decimals: cand.decimals ?? decimals,
      evidence,
      status: 'verified',
    })!;
    return c.json({
      candidate: updated,
      threeSource: threeSourceOk(updated.evidence),
      promoteReady: canPromote(updated).ok,
      gate: canPromote(updated),
    });
  } catch (e) {
    return jsonError(c, e);
  }
});

assetRoutes.post('/assets/candidates/:id/promote', async (c) => {
  try {
    const auth = c.req.header('authorization');
    try {
      requireCron(auth);
    } catch {
      if (process.env.MOCK_CHAIN !== '1' && process.env.MOCK_CHAIN !== 'true') {
        throw new ApiError('UNAUTHENTICATED');
      }
    }
    const result = await promoteCandidate(c.req.param('id'));
    return c.json({ ok: true, ...result });
  } catch (e) {
    return jsonError(c, e);
  }
});

assetRoutes.post('/jobs/registry/scrape-xstocks', async (c) => {
  try {
    requireCron(c.req.header('authorization'));
    const result = await scrapeXstocksFeatured();
    return c.json({ ok: true, proposed: result.proposed.length, skipped: result.skipped });
  } catch (e) {
    return jsonError(c, e);
  }
});
