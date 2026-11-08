import { z } from 'zod';
import { getSql } from '../../db/client.js';
import { newId } from '../ids.js';
import { ogChat } from '../og/client.js';
import { configForJob } from '../og/models.js';
import { extractJson } from '../og/schemas.js';
import { filterKnown, lookupProductGraph, materialsForCategory, type GraphLink } from './graph.js';

const MaterialsOut = z.object({
  materials: z
    .array(z.object({ companyId: z.string(), why: z.string().max(200) }))
    .max(4)
    .default([]),
});

const TRACE_MATERIALS = {
  version: 'trace_materials.v1',
  system: `You map a product to commodity / material assets the buyer can own.
You may ONLY pick companyId from REGISTRY (usually mat:gold, mat:silver, or commodity ids).
Hardware/phones often use gold and silver. Soap, digital SaaS, and pure services → return [].
Never invent ids. why is one short sentence.
Return only JSON: {"materials":[{"companyId":string,"why":string}]}`,
};

async function logRun(purchaseId: string, ok: boolean, requestId: string | null, latencyMs: number) {
  const sql = getSql();
  await sql`
    INSERT INTO ai_runs (id, purchase_id, job, model, prompt_version, og_request_id, latency_ms, ok, created_at)
    VALUES (${newId()}::uuid, ${purchaseId}::uuid, 'extract_suppliers', ${configForJob('extract_suppliers').id}, ${TRACE_MATERIALS.version},
            ${requestId}, ${latencyMs}, ${ok}, now())
  `;
}

const MATERIAL_IDS = new Set(['mat:gold', 'mat:silver']);

/** Materials juror: category seed first, then optional LLM for hardware-like products. */
export async function traceMaterials(
  purchaseId: string,
  product: string,
  brand: string | null,
): Promise<GraphLink[]> {
  const seeded = lookupProductGraph(product, brand);
  if (seeded) {
    const fromProduct = filterKnown(seeded.materials);
    if (fromProduct.length) return fromProduct;
    const fromCat = filterKnown(materialsForCategory(seeded.category));
    if (fromCat.length) return fromCat;
    // Digital / CPG with empty materials — skip LLM.
    if (seeded.category.startsWith('digital') || seeded.category.startsWith('cpg')) return [];
  }

  const registry = [...MATERIAL_IDS].map((id) => `${id} | commodity`).join('\n');
  const t0 = Date.now();
  try {
    const res = await ogChat({
      job: 'extract_suppliers',
      messages: [
        { role: 'system', content: TRACE_MATERIALS.system },
        { role: 'user', content: `REGISTRY:\n${registry}\n\nPRODUCT: ${product}\nBRAND: ${brand ?? 'unknown'}` },
      ],
      maxTokens: 400,
      timeoutMs: 25_000,
    });
    await logRun(purchaseId, true, res.requestId ?? null, res.latencyMs ?? Date.now() - t0);
    const parsed = MaterialsOut.parse(extractJson(res.content));
    return filterKnown(
      parsed.materials
        .filter((m) => MATERIAL_IDS.has(m.companyId) || m.companyId.startsWith('mat:'))
        .map((m) => ({ assetId: m.companyId, why: m.why })),
    );
  } catch {
    await logRun(purchaseId, false, null, Date.now() - t0);
    return [];
  }
}
