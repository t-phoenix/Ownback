/**
 * Purchase reading on 0G Private Computer (ai-spec.md § Match pipeline).
 * AI suggests; code decides: every model output is parsed with zod and checked in code
 * before anything is written. The image / audio is never stored (docs/06).
 */
import { getSql } from '../../db/client.js';
import { getAsset } from '../../shared/assets.js';
import { getCatalogCompany, registryLinesForMaker } from '../registry/catalog.js';
import { newId } from '../ids.js';
import { splitInvest } from '../split.js';
import { decimalToCents, localCentsToUsd6, rateToScaled, usdRate } from '../fx.js';
import { ogChat, ogHeaders, type OgChatResult } from './client.js';
import { configForJob, type OgJob } from './models.js';
import { FIND_MAKER, PARSE_TYPED, READ_RECEIPT } from './prompts.js';
import { extractJson, MakerMatch, normaliseRead, ReceiptRead } from './schemas.js';


export type ReadInput =
  | { kind: 'image'; dataUrl: string }
  | { kind: 'text'; text: string; makerHint?: string }
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
    const res = await ogChat({ job, messages, maxTokens: 1024, timeoutMs: job === 'read_receipt' ? 25_000 : 15_000 });
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

async function readFields(purchaseId: string, input: ReadInput): Promise<ReceiptRead> {
  let raw: unknown;
  if (input.kind === 'image') {
    raw = await chatJson(purchaseId, 'read_receipt', READ_RECEIPT.version, [
      { role: 'system', content: READ_RECEIPT.system },
      { role: 'user', content: [
        { type: 'text', text: 'Read this receipt. Reply with the JSON only.' },
        { type: 'image_url', image_url: { url: input.dataUrl } },
      ] },
    ]);
  } else {
    const text = input.kind === 'audio' ? await transcribe(purchaseId, input.file, input.filename) : input.text;
    raw = await chatJson(purchaseId, 'parse_spoken', PARSE_TYPED.version, [
      { role: 'system', content: PARSE_TYPED.system },
      { role: 'user', content: text.slice(0, 2000) },
    ]);
  }
  return ReceiptRead.parse(normaliseRead(raw));
}

/** Registry-constrained maker lookup. Code rejects any id the catalog doesn't hold (A9). */
async function findMaker(purchaseId: string, product: string, brand: string | null): Promise<MakerMatch | null> {
  const registry = registryLinesForMaker();
  // Cap prompt size: prefer verified/tokenized first, then head of list.
  const ranked = [...registry].sort((a, b) => {
    const score = (s: string) => (s.includes('buyable') ? 0 : s.includes('tokenized_candidate') ? 1 : 2);
    return score(a) - score(b);
  });
  const clipped = ranked.slice(0, 400).join('\n');
  const raw = await chatJson(purchaseId, 'find_maker', FIND_MAKER.version, [
    { role: 'system', content: FIND_MAKER.system },
    { role: 'user', content: `REGISTRY:\n${clipped}\n\nPRODUCT: ${product}\nBRAND: ${brand ?? 'unknown'}` },
  ]);
  const m = MakerMatch.parse(raw);
  if (m.companyId && !getCatalogCompany(m.companyId) && !getAsset(m.companyId)) {
    return { ...m, companyId: null, listed: false };
  }
  return m;
}

export type ReadOutcome = { status: 'ready' | 'needs_review' | 'not_listed' | 'read_failed'; readError?: string };

/**
 * Reads, converts, matches and splits one purchase, then writes the result.
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

  // Makers: one lookup per distinct brand (or the typed maker hint), at most 3.
  const products = read.items.length ? read.items : [{ name: read.shop ?? 'Purchase', brand: null, qty: 1, lineTotal: null }];
  const seen = new Set<string>();
  const makers: { assetId: string; role: 'maker'; why: string }[] = [];
  let lowConfidence = confidence < 0.7;
  const hint = input.kind === 'text' ? input.makerHint : undefined;
  for (const item of products) {
    const brand = hint ?? item.brand;
    const key = (brand ?? item.name).toLowerCase();
    if (seen.has(key) || seen.size >= 3) continue;
    seen.add(key);
    try {
      const m = await findMaker(purchaseId, item.name, brand ?? null);
      if (m?.confidence !== undefined && m.confidence < 0.7) lowConfidence = true;
      if (m?.companyId && !makers.some((x) => x.assetId === m.companyId)) makers.push({ assetId: m.companyId, role: 'maker', why: m.evidence });
    } catch { lowConfidence = true; }
  }
  if (makers.length > 2) lowConfidence = true;

  const split = splitInvest({
    amountUsd6,
    rateBps: rules.rate_bps,
    split: { maker: rules.split_maker, behind: rules.split_behind, materials: rules.split_materials },
    makers,
    behind: [],
    materials: [],
    fallbackAsset: rules.fallback_asset,
  });
  const status: ReadOutcome['status'] = makers.length === 0 ? 'not_listed' : lowConfidence ? 'needs_review' : 'ready';

  await sql`
    UPDATE purchases SET
      status = ${status}, shop = ${read.shop ?? 'Receipt'}, place = ${read.place},
      items = ${sql.json(read.items.map((i) => ({ name: i.name, brand: i.brand, qty: i.qty })))}::jsonb,
      purchased_on = ${date}, amount_local = ${read.total}, currency = ${read.currency},
      fx_rate = ${fx.rate}, fx_source = ${fx.source}, fx_date = ${fx.date},
      amount_usd6 = ${amountUsd6.toString()}::bigint, rate_bps = ${rules.rate_bps},
      invest_usd6 = ${split.investUsd6.toString()}::bigint,
      split = ${sql.json({ maker: rules.split_maker, behind: rules.split_behind, materials: rules.split_materials })}::jsonb,
      read_error = NULL, updated_at = now()
    WHERE id = ${purchaseId}::uuid AND user_id = ${userId}::uuid
  `;
  await sql`DELETE FROM allocations WHERE purchase_id = ${purchaseId}::uuid`;
  for (const row of split.rows) {
    const why = makers.find((m) => m.assetId === row.assetId)?.why ?? null;
    await sql`
      INSERT INTO allocations (id, purchase_id, asset_id, role, amount_usd6, selected, why)
      VALUES (${newId()}::uuid, ${purchaseId}::uuid, ${row.assetId}, ${row.role}, ${row.amountUsd6.toString()}::bigint, true, ${why})
    `;
  }
  return { status };
}
