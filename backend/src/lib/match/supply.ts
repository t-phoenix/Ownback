import { z } from 'zod';
import { getSql } from '../../db/client.js';
import { newId } from '../ids.js';
import { ogChat } from '../og/client.js';
import { configForJob } from '../og/models.js';
import { extractJson } from '../og/schemas.js';
import { filterKnown, lookupProductGraph, type GraphLink } from './graph.js';
import { registryLinesForMaker } from '../registry/catalog.js';

const SupplyOut = z.object({
  suppliers: z
    .array(
      z.object({
        companyId: z.string(),
        why: z.string().max(200),
      }),
    )
    .max(5)
    .default([]),
});

const TRACE_SUPPLY = {
  version: 'trace_supply.v1',
  system: `You identify public companies in the supply chain that bring a product to the buyer.
You may ONLY pick companyId values from the REGISTRY list. Never invent ids or tickers.
Return 0–3 suppliers that are not the maker itself. Each why is one short sentence (max 200 chars).
For digital/SaaS products, prefer listed cloud/infra parents only if clearly in REGISTRY.
For soap/CPG, suppliers are often private — return [] rather than guess.
Return only JSON: {"suppliers":[{"companyId":string,"why":string}]}`,
};

async function logRun(purchaseId: string, ok: boolean, requestId: string | null, latencyMs: number) {
  const sql = getSql();
  await sql`
    INSERT INTO ai_runs (id, purchase_id, job, model, prompt_version, og_request_id, latency_ms, ok, created_at)
    VALUES (${newId()}::uuid, ${purchaseId}::uuid, 'extract_suppliers', ${configForJob('extract_suppliers').id}, ${TRACE_SUPPLY.version},
            ${requestId}, ${latencyMs}, ${ok}, now())
  `;
}

/** Supply-chain juror: seed graph first, then optional LLM constrained to registry. */
export async function traceSupply(
  purchaseId: string,
  product: string,
  brand: string | null,
  makerId: string | null,
): Promise<GraphLink[]> {
  const seeded = lookupProductGraph(product, brand);
  if (seeded?.behind.length) {
    return filterKnown(seeded.behind.filter((b) => b.assetId !== makerId));
  }

  const registry = registryLinesForMaker()
    .sort((a, b) => (a.includes('buyable') ? 0 : 1) - (b.includes('buyable') ? 0 : 1))
    .slice(0, 200)
    .join('\n');
  const t0 = Date.now();
  try {
    const res = await ogChat({
      job: 'extract_suppliers',
      messages: [
        { role: 'system', content: TRACE_SUPPLY.system },
        {
          role: 'user',
          content: `REGISTRY:\n${registry}\n\nPRODUCT: ${product}\nBRAND: ${brand ?? 'unknown'}\nMAKER: ${makerId ?? 'unknown'}`,
        },
      ],
      maxTokens: 512,
      timeoutMs: 30_000,
    });
    await logRun(purchaseId, true, res.requestId ?? null, res.latencyMs ?? Date.now() - t0);
    const parsed = SupplyOut.parse(extractJson(res.content));
    return filterKnown(
      parsed.suppliers
        .filter((s) => s.companyId !== makerId)
        .map((s) => ({ assetId: s.companyId, why: s.why })),
    );
  } catch {
    await logRun(purchaseId, false, null, Date.now() - t0);
    return [];
  }
}
