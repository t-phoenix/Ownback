import { getAsset } from '../../shared/assets.js';
import { getCatalogCompany, registryLinesForMaker, searchCompanies } from '../registry/catalog.js';
import { ogChat } from '../og/client.js';
import { FIND_MAKER } from '../og/prompts.js';
import { extractJson, MakerMatch } from '../og/schemas.js';
import { configForJob } from '../og/models.js';
import { newId } from '../ids.js';
import { getSql } from '../../db/client.js';

async function logRun(purchaseId: string, ok: boolean, requestId: string | null, latencyMs: number) {
  const sql = getSql();
  await sql`
    INSERT INTO ai_runs (id, purchase_id, job, model, prompt_version, og_request_id, latency_ms, ok, created_at)
    VALUES (${newId()}::uuid, ${purchaseId}::uuid, 'find_maker', ${configForJob('find_maker').id}, ${FIND_MAKER.version},
            ${requestId}, ${latencyMs}, ${ok}, now())
  `;
}

/** Exact/alias hit in the discovery catalog — no AI. */
export function catalogMakerHit(query: string): MakerMatch | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const hit = searchCompanies(query, 12).find((c) => {
    if (c.name.toLowerCase() === q || c.assetId === q || c.ticker?.toLowerCase() === q) return true;
    return c.aliases.some((a) => a.toLowerCase() === q);
  });
  if (!hit) return null;
  return {
    brand: hit.name,
    companyId: hit.assetId,
    companyName: hit.name,
    listed: true,
    confidence: 1,
    evidence: `Matched registry company ${hit.name}`,
  };
}

/** Registry-constrained maker juror. */
export async function findMaker(
  purchaseId: string,
  product: string,
  brand: string | null,
): Promise<MakerMatch | null> {
  const direct = (brand && catalogMakerHit(brand)) || catalogMakerHit(product);
  if (direct) return direct;

  const registry = registryLinesForMaker();
  const ranked = [...registry].sort((a, b) => {
    const score = (s: string) => (s.includes('buyable') ? 0 : s.includes('tokenized_candidate') ? 1 : 2);
    return score(a) - score(b);
  });
  const clipped = ranked.slice(0, 400).join('\n');
  const t0 = Date.now();
  try {
    const res = await ogChat({
      job: 'find_maker',
      messages: [
        { role: 'system', content: FIND_MAKER.system },
        { role: 'user', content: `REGISTRY:\n${clipped}\n\nPRODUCT: ${product}\nBRAND: ${brand ?? 'unknown'}` },
      ],
      maxTokens: 1024,
      timeoutMs: 45_000,
    });
    await logRun(purchaseId, true, res.requestId ?? null, res.latencyMs ?? Date.now() - t0);
    const m = MakerMatch.parse(extractJson(res.content));
    if (m.companyId && !getCatalogCompany(m.companyId) && !getAsset(m.companyId)) {
      return { ...m, companyId: null, listed: false };
    }
    return m;
  } catch {
    await logRun(purchaseId, false, null, Date.now() - t0);
    return null;
  }
}
