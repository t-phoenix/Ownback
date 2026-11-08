/**
 * Purchase reading on 0G Private Computer (ai-spec.md § Match pipeline).
 * AI suggests; code decides: every model output is parsed with zod and checked in code
 * before anything is written. The image / audio is never stored (docs/06).
 *
 * Match jury: maker → supply → materials → buyable notes → finalize/split (lib/match/).
 */
import { getSql } from '../../db/client.js';
import { newId } from '../ids.js';
import { decimalToCents, localCentsToUsd6, rateToScaled, usdRate } from '../fx.js';
import { ogChat, ogHeaders, type OgChatResult } from './client.js';
import { configForJob, type OgJob } from './models.js';
import { PARSE_TYPED, READ_RECEIPT } from './prompts.js';
import { extractJson, normaliseRead, ReceiptRead } from './schemas.js';
import { findMaker, finalizeMatch, lookupProductGraph, traceMaterials, traceSupply, type MatchParty } from '../match/index.js';

export type ReadInput =
  | { kind: 'image'; dataUrl: string }
  | { kind: 'typed'; product: string; amount: string; currency: string; maker?: string }
  | { kind: 'audio'; file: Blob; filename: string };

type Rules = { rate_bps: number; fallback_asset: string; split_maker: number; split_behind: number; split_materials: number };

async function logRun(purchaseId: string, job: OgJob, promptVersion: string, r: Partial<OgChatResult> & { ok: boolean; latencyMs?: number }) {
  const sql = getSql();
  await sql`
    INSERT INTO ai_runs (id, purchase_id, job, model, prompt_version, og_request_id, latency_ms, ok, created_at)
    VALUES (${newId()}::uuid, ${purchaseId}::uuid, ${job}, ${r.model ?? configForJob(job).id}, ${promptVersion},
            ${r.requestId ?? null}, ${r.latencyMs ?? null}, ${r.ok}, now())
  `;
}

async function chatJson(purchaseId: string, job: OgJob, promptVersion: string, messages: unknown[]) {
  const t0 = Date.now();
  try {
    const res = await ogChat({ job, messages, maxTokens: 1024, timeoutMs: job === 'read_receipt' ? 45_000 : 45_000 });
    await logRun(purchaseId, job, promptVersion, { ...res, ok: true });
    return extractJson(res.content);
  } catch (e) {
    await logRun(purchaseId, job, promptVersion, { ok: false, latencyMs: Date.now() - t0 });
    throw e;
  }
}

/** Private speech-to-text (whisper on a TeeML provider). */
async function transcribe(purchaseId: string, file: Blob, filename: string): Promise<string> {
  const cfg = configForJob('transcribe');
  const t0 = Date.now();
  const form = new FormData();
  form.append('model', cfg.id);
  form.append('file', file, filename);
  const headers = ogHeaders({ provider: cfg.provider });
  delete headers['Content-Type'];
  const res = await fetch('https://router-api.0g.ai/v1/audio/transcriptions', { method: 'POST', headers, body: form, signal: AbortSignal.timeout(30_000) });
  const body = (await res.json().catch(() => ({}))) as { text?: string; x_0g_trace?: { request_id?: string }; id?: string };
  await logRun(purchaseId, 'transcribe', 'transcribe.v1', { ok: res.ok && !!body.text, model: cfg.id, requestId: body.x_0g_trace?.request_id ?? body.id ?? null, latencyMs: Date.now() - t0 });
  if (!res.ok || !body.text) throw new Error(`transcribe_failed:${res.status}`);
  return body.text;
}

const REPAIR_RECEIPT = {
  version: 'repair_receipt.v1',
  system: `You repair a partial receipt JSON. Fill null fields only when clearly visible in the image. Never invent a total. Return the same schema. List missing critical fields in "missing": string[].`,
};

async function readFields(purchaseId: string, input: ReadInput): Promise<ReceiptRead> {
  // Typed entries are already structured; asking the model to re-parse them timed out (>15s) and failed the read.
  if (input.kind === 'typed') {
    return ReceiptRead.parse(normaliseRead({
      isReceipt: true, shop: null, currency: input.currency, total: input.amount, confidence: 1,
      items: [{ name: input.product, brand: input.maker ?? null, qty: 1, lineTotal: input.amount }],
    }));
  }
  let raw: unknown;
  if (input.kind === 'image') {
    raw = await chatJson(purchaseId, 'read_receipt', READ_RECEIPT.version, [
      { role: 'system', content: READ_RECEIPT.system },
      { role: 'user', content: [
        { type: 'text', text: 'Read this receipt. Reply with the JSON only.' },
        { type: 'image_url', image_url: { url: input.dataUrl } },
      ] },
    ]);
    let read = ReceiptRead.parse(normaliseRead(raw));
    // Pass 2: repair when confidence is low or critical fields missing.
    if (read.confidence < 0.85 || !read.total || !read.currency || read.items.length === 0) {
      try {
        const repaired = await chatJson(purchaseId, 'read_receipt', REPAIR_RECEIPT.version, [
          { role: 'system', content: REPAIR_RECEIPT.system },
          { role: 'user', content: [
            { type: 'text', text: `Partial JSON:\n${JSON.stringify(raw)}\nRepair from the image. Reply with JSON only.` },
            { type: 'image_url', image_url: { url: input.dataUrl } },
          ] },
        ]);
        read = ReceiptRead.parse(normaliseRead(repaired));
      } catch {
        /* keep first pass */
      }
    }
    return read;
  }
  const text = await transcribe(purchaseId, input.file, input.filename);
  raw = await chatJson(purchaseId, 'parse_spoken', PARSE_TYPED.version, [
    { role: 'system', content: PARSE_TYPED.system },
    { role: 'user', content: text.slice(0, 2000) },
  ]);
  return ReceiptRead.parse(normaliseRead(raw));
}

export type ReadOutcome = { status: 'ready' | 'needs_review' | 'not_listed' | 'read_failed'; readError?: string };

/**
 * Reads, converts, matches (jury) and splits one purchase, then writes the result.
 * Runs inside the POST so it also works on serverless hosts (no background job runner yet).
 */
export async function readPurchase(purchaseId: string, userId: string, rules: Rules, input: ReadInput): Promise<ReadOutcome> {
  const sql = getSql();
  const fail = async (readError: 'no_total' | 'no_product' | 'not_a_receipt') => {
    await sql`UPDATE purchases SET status = 'read_failed', read_error = ${readError}, updated_at = now() WHERE id = ${purchaseId}::uuid`;
    return { status: 'read_failed' as const, readError };
  };

  let read: ReceiptRead;
  try { read = await readFields(purchaseId, input); }
  catch { return fail('not_a_receipt'); }

  if (!read.isReceipt) return fail('not_a_receipt');
  // shortcut: TeeML sometimes sets isProduct=false on clear retail lines; trust items+total when present
  if (!read.isProduct && read.items.length > 0 && read.total && read.currency) {
    read = { ...read, isProduct: true, confidence: Math.min(read.confidence, 0.75) };
  }
  if (!read.isProduct) return fail('no_product');
  if (!read.total || !read.currency) return fail('no_total');
  const localCents = decimalToCents(read.total);
  if (localCents <= 0n) return fail('no_total');

  // Code checks after the AI.
  let confidence = read.confidence;
  const lineSum = read.items.reduce((s, i) => s + (i.lineTotal ? decimalToCents(i.lineTotal) : 0n), 0n);
  if (lineSum > 0n) {
    const diff = lineSum > localCents ? lineSum - localCents : localCents - lineSum;
    if (diff * 50n > localCents) confidence = Math.min(confidence, 0.5); // off by more than 2%
  }
  const today = new Date().toISOString().slice(0, 10);
  const date = read.date && read.date <= today ? read.date : today;

  let fx: { rate: string; source: string; date: string };
  try { fx = await usdRate(read.currency); } catch { return fail('no_total'); }
  const amountUsd6 = localCentsToUsd6(localCents, rateToScaled(fx.rate));

  // Jury: makers (≤3) → supply + materials for the primary product line.
  const products = read.items.length ? read.items : [{ name: read.shop ?? 'Purchase', brand: null, qty: 1, lineTotal: null }];
  const seen = new Set<string>();
  const makers: MatchParty[] = [];
  let lowConfidence = confidence < 0.7;
  const hint = input.kind === 'typed' ? input.maker : undefined;
  for (const item of products) {
    const brand = hint ?? item.brand;
    const key = (brand ?? item.name).toLowerCase();
    if (seen.has(key) || seen.size >= 3) continue;
    seen.add(key);
    // Seed graph maker hint can short-circuit catalog when brand is empty.
    const graph = lookupProductGraph(item.name, brand);
    try {
      const m = await findMaker(purchaseId, item.name, brand ?? graph?.makerHint ?? null);
      if (m?.confidence !== undefined && m.confidence < 0.7) lowConfidence = true;
      if (m?.companyId && !makers.some((x) => x.assetId === m.companyId)) {
        makers.push({ assetId: m.companyId, role: 'maker', why: m.evidence });
      }
    } catch { lowConfidence = true; }
  }
  if (makers.length > 2) lowConfidence = true;

  const primary = products[0]!;
  const primaryBrand = hint ?? primary.brand;
  const makerId = makers[0]?.assetId ?? null;
  const [behind, materials] = await Promise.all([
    traceSupply(purchaseId, primary.name, primaryBrand, makerId),
    traceMaterials(purchaseId, primary.name, primaryBrand),
  ]);

  const jury = await finalizeMatch({
    amountUsd6,
    rateBps: rules.rate_bps,
    split: { maker: rules.split_maker, behind: rules.split_behind, materials: rules.split_materials },
    fallbackAsset: rules.fallback_asset,
    makers,
    behind,
    materials,
    lowConfidence,
  });

  const status: ReadOutcome['status'] =
    makers.length === 0 && jury.split.notListed ? 'not_listed' : jury.lowConfidence ? 'needs_review' : 'ready';

  const whyByAsset = new Map<string, string>();
  for (const p of [...jury.makers, ...jury.behind, ...jury.materials]) whyByAsset.set(p.assetId, p.why);

  await sql`
    UPDATE purchases SET
      status = ${status}, shop = ${read.shop ?? 'Receipt'}, place = ${read.place},
      items = ${sql.json(read.items.map((i) => ({ name: i.name, brand: i.brand, qty: i.qty })))}::jsonb,
      purchased_on = ${date}, amount_local = ${read.total}, currency = ${read.currency},
      fx_rate = ${fx.rate}, fx_source = ${fx.source}, fx_date = ${fx.date},
      amount_usd6 = ${amountUsd6.toString()}::bigint, rate_bps = ${rules.rate_bps},
      invest_usd6 = ${jury.split.investUsd6.toString()}::bigint,
      split = ${sql.json({ maker: rules.split_maker, behind: rules.split_behind, materials: rules.split_materials })}::jsonb,
      read_error = NULL, updated_at = now()
    WHERE id = ${purchaseId}::uuid AND user_id = ${userId}::uuid
  `;
  await sql`DELETE FROM allocations WHERE purchase_id = ${purchaseId}::uuid`;
  for (const row of jury.split.rows) {
    const why = whyByAsset.get(row.assetId) ?? null;
    await sql`
      INSERT INTO allocations (id, purchase_id, asset_id, role, amount_usd6, selected, why)
      VALUES (${newId()}::uuid, ${purchaseId}::uuid, ${row.assetId}, ${row.role}, ${row.amountUsd6.toString()}::bigint, true, ${why})
    `;
  }
  return { status };
}
