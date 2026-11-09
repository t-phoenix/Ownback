/**
 * Purchase reading on 0G Private Computer (ai-spec.md § Pipeline, D30).
 * Runs after POST /purchases has answered (status `reading`) and writes real `steps` as it goes.
 * AI suggests; code decides: every model output is parsed with zod and checked in code
 * before anything is written. The image / audio is never stored (docs/06).
 */
import { getSql } from '../../db/client.js';
import { newId } from '../ids.js';
import { decimalToCents, localCentsToUsd6, rateToScaled, usdRate } from '../fx.js';
import { splitInvest } from '../split.js';
import type { ReadError } from '../../shared/errors.js';
import type { PurchaseStatus, ReadStepKey, ReadStepState } from '../../shared/states.js';
import { ogErrorKind, ogHeaders } from './client.js';
import { configForJob } from './models.js';
import { PARSE_TYPED, READ_RECEIPT, REPAIR_RECEIPT } from './prompts.js';
import { chatJson, logRun } from './runs.js';
import { missingFields, normaliseRead, ReceiptRead } from './schemas.js';
import { getCachedVerdict, productKey, putCachedVerdict, runJury, seedVerdict, type JuryRun } from '../match/jury.js';
import { resolveRow, type JuryRow } from '../match/resolve.js';

export type ReadInput =
  | { kind: 'image'; dataUrl: string }
  | { kind: 'typed'; product: string; amount: string; currency: string; maker?: string; model?: string; shop?: string; date?: string }
  | { kind: 'audio'; file: Blob; filename: string };

export type Rules = { rate_bps: number; fallback_asset: string; split_maker: number; split_behind: number; split_materials: number };

/** Fields the jury needs; the "Check the details" form edits exactly these. */
export type DetailsIn = {
  merchant?: string | null;
  date?: string | null;
  currency: string;
  subtotal?: string | null;
  tax?: string | null;
  total: string;
  items: { name: string; brand?: string | null; model?: string | null; category?: string | null; qty: number; unitPrice?: string | null; lineTotal?: string | null }[];
};

export type ReadOutcome = { status: PurchaseStatus; readError?: ReadError };

export type Step = { key: ReadStepKey; state: ReadStepState; label: string };

const LABELS: Record<ReadStepKey, string> = {
  read: 'Read the receipt',
  convert: 'Convert to dollars',
  understand: 'Understand the product',
  jury: 'Ask 3 private AI jurors',
  judge: 'Merge their answers',
  resolve: 'Check which ones you can buy',
};

export function freshSteps(readDone = false): Step[] {
  return (Object.keys(LABELS) as ReadStepKey[]).map((key) => ({ key, label: LABELS[key], state: readDone && key === 'read' ? 'done' : 'todo' }));
}

/** Keeps purchases.steps in sync with the work (Reading screen polls it). */
export class StepWriter {
  constructor(private readonly purchaseId: string, readonly steps: Step[] = freshSteps()) {}
  async set(key: ReadStepKey, state: ReadStepState) {
    const s = this.steps.find((x) => x.key === key);
    if (s) s.state = state;
    await getSql()`UPDATE purchases SET steps = ${getSql().json(this.steps)}::jsonb, updated_at = now() WHERE id = ${this.purchaseId}::uuid`;
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

const parseRead = (raw: unknown) => ReceiptRead.parse(normaliseRead(raw));
const EMPTY_READ: ReceiptRead = { isReceipt: true, merchant: null, place: null, date: null, currency: null, subtotal: null, tax: null, total: null, items: [], confidence: 0 };

export async function readFields(purchaseId: string, input: ReadInput): Promise<ReceiptRead> {
  // Typed entries are already structured: no model call.
  if (input.kind === 'typed') {
    return parseRead({
      isReceipt: true, merchant: input.shop ?? null, date: input.date ?? null, currency: input.currency, total: input.amount, confidence: 1,
      items: [{ name: input.product, brand: input.maker ?? null, model: input.model ?? null, qty: 1, lineTotal: input.amount }],
    });
  }
  if (input.kind === 'audio') {
    const text = await transcribe(purchaseId, input.file, input.filename);
    const { value } = await chatJson({
      purchaseId, job: 'parse_spoken', promptVersion: PARSE_TYPED.version, maxTokens: 1024,
      messages: [{ role: 'system', content: PARSE_TYPED.system }, { role: 'user', content: text.slice(0, 2000) }],
      parse: parseRead,
    });
    return value;
  }
  const image = { type: 'image_url', image_url: { url: input.dataUrl } };
  let read: ReceiptRead | null = null;
  try {
    ({ value: read } = await chatJson({
      purchaseId, job: 'read_receipt', promptVersion: READ_RECEIPT.version, maxTokens: 1500,
      messages: [
        { role: 'system', content: READ_RECEIPT.system },
        { role: 'user', content: [{ type: 'text', text: 'Read this receipt. Reply with the JSON only.' }, image] },
      ],
      parse: parseRead,
    }));
  } catch (e) {
    if (!(e as { badJson?: boolean }).badJson) throw e; // 0G down / timeout → retryable read error
  }
  if (read && !read.isReceipt) return read;
  // Pass 2: repair when the first pass was unreadable, unsure, or missing what the jury needs.
  if (!read || read.confidence < 0.85 || missingFields(read).some((m) => m === 'total' || m === 'currency' || m === 'items')) {
    try {
      const { value } = await chatJson({
        purchaseId, job: 'read_receipt', promptVersion: REPAIR_RECEIPT.version, maxTokens: 1500,
        messages: [
          { role: 'system', content: REPAIR_RECEIPT.system },
          { role: 'user', content: [{ type: 'text', text: `Partial JSON:\n${JSON.stringify(read ?? {})}\nRepair from the image. Reply with JSON only.` }, image] },
        ],
        parse: parseRead,
      });
      read = value;
    } catch {
      /* keep first pass */
    }
  }
  return read ?? EMPTY_READ; // unreadable twice → empty form, not a dead end
}

async function fail(purchaseId: string, readError: ReadError): Promise<ReadOutcome> {
  await getSql()`UPDATE purchases SET status = 'read_failed', read_error = ${readError}, updated_at = now() WHERE id = ${purchaseId}::uuid`;
  return { status: 'read_failed', readError };
}

/** Full worker: read → details → analysis. Never throws; the row always leaves `reading`. */
export async function readPurchase(purchaseId: string, userId: string, rules: Rules, input: ReadInput): Promise<ReadOutcome> {
  const sql = getSql();
  const steps = new StepWriter(purchaseId);
  try {
    await steps.set('read', 'running');
    let read: ReceiptRead;
    try {
      read = await readFields(purchaseId, input);
    } catch (e) {
      await steps.set('read', 'failed');
      return fail(purchaseId, ogErrorKind(e));
    }
    if (!read.isReceipt) {
      await steps.set('read', 'failed');
      return fail(purchaseId, 'not_a_receipt');
    }
    const missing = missingFields(read);
    const { isReceipt: _r, confidence: _c, place, ...fields } = read;
    await sql`
      UPDATE purchases SET details = ${sql.json({ ...fields, missing })}::jsonb, place = ${place},
        shop = ${read.merchant}, items = ${sql.json(read.items)}::jsonb, updated_at = now()
      WHERE id = ${purchaseId}::uuid
    `;
    await steps.set('read', 'done');
    if (missing.some((m) => m === 'total' || m === 'currency' || m === 'items') || read.confidence < 0.5) {
      await sql`UPDATE purchases SET status = 'needs_details', read_error = NULL, updated_at = now() WHERE id = ${purchaseId}::uuid`;
      return { status: 'needs_details' };
    }
    return await analysePurchase(purchaseId, userId, rules, { ...fields, currency: read.currency!, total: read.total! }, read.confidence, steps);
  } catch (e) {
    console.error('readPurchase', purchaseId, (e as Error).message);
    return fail(purchaseId, ogErrorKind(e));
  }
}

const pickPrimary = (items: DetailsIn['items']) =>
  [...items].sort((a, b) => Number(decimalToCents(b.lineTotal ?? '0') - decimalToCents(a.lineTotal ?? '0')))[0]!;

/**
 * Convert → jury (or cache / seed) → resolve → split → write. Also the PUT /details path.
 * Money goes only to buyable rows; empty roles roll into the parent, then the fallback (splitInvest).
 */
export async function analysePurchase(
  purchaseId: string,
  userId: string,
  rules: Rules,
  d: DetailsIn,
  readConfidence: number,
  steps: StepWriter = new StepWriter(purchaseId, freshSteps(true)),
): Promise<ReadOutcome> {
  const sql = getSql();
  const needsDetails = async () => {
    await sql`UPDATE purchases SET status = 'needs_details', updated_at = now() WHERE id = ${purchaseId}::uuid`;
    return { status: 'needs_details' as const };
  };

  await steps.set('convert', 'running');
  const localCents = decimalToCents(d.total);
  if (localCents <= 0n) return needsDetails();
  let fx: { rate: string; source: string; date: string };
  try {
    fx = await usdRate(d.currency);
  } catch {
    await steps.set('convert', 'failed');
    return needsDetails();
  }
  const amountUsd6 = localCentsToUsd6(localCents, rateToScaled(fx.rate));
  let confidence = readConfidence;
  const lineSum = d.items.reduce((s, i) => s + (i.lineTotal ? decimalToCents(i.lineTotal) : 0n), 0n);
  if (lineSum > 0n) {
    const diff = lineSum > localCents ? lineSum - localCents : localCents - lineSum;
    if (diff * 50n > localCents) confidence = Math.min(confidence, 0.5); // items off the total by > 2%
  }
  await steps.set('convert', 'done');

  const primary = pickPrimary(d.items);
  const product = { name: primary.name, brand: primary.brand, model: primary.model, category: primary.category, merchant: d.merchant };
  const key = productKey(product);
  let run: JuryRun;
  const cached = await getCachedVerdict(key).catch(() => null);
  if (cached) {
    run = { ...cached, requestIds: [], source: 'cache' };
    for (const k of ['understand', 'jury', 'judge'] as const) await steps.set(k, 'done');
  } else {
    try {
      run = await runJury(purchaseId, product, { onStep: (k, s) => steps.set(k, s) });
      if (run.jurors.filter((j) => j.ok).length >= 2) await putCachedVerdict(key, primary.name.slice(0, 200), run).catch(() => {});
    } catch {
      const seed = await seedVerdict(product);
      if (!seed) return fail(purchaseId, 'og_unavailable');
      run = { ...seed, requestIds: [], source: 'seed' };
      await steps.set('judge', 'done');
    }
  }

  await steps.set('resolve', 'running');
  const of = run.jurors.filter((j) => j.ok).length || 1;
  const [parent, enablers, commodities] = await Promise.all([
    run.parent ? resolveRow('company', run.parent, of) : Promise.resolve(null),
    Promise.all(run.enablers.map((r) => resolveRow('company', r, of))),
    Promise.all(run.commodities.map((r) => resolveRow('commodity', r, of))),
  ]);
  const rows: JuryRow[] = [...(parent ? [parent] : []), ...enablers, ...commodities];
  const taken = new Set<string>();
  const buyable = (list: JuryRow[]) =>
    list.filter((r) => r.status === 'buyable' && r.assetId && !taken.has(r.assetId) && taken.add(r.assetId)).map((r) => r.assetId!);
  const makerIds = buyable(parent ? [parent] : []);
  const behindIds = buyable(enablers);
  const materialIds = buyable(commodities);
  const split = splitInvest({
    amountUsd6,
    rateBps: rules.rate_bps,
    split: { maker: rules.split_maker, behind: rules.split_behind, materials: rules.split_materials },
    makers: makerIds.map((assetId) => ({ assetId, role: 'maker' as const })),
    behind: behindIds.map((assetId) => ({ assetId, role: 'supplier' as const })),
    materials: materialIds.map((assetId) => ({ assetId, role: 'material' as const })),
    fallbackAsset: rules.fallback_asset,
  });

  const anyBuyable = taken.size > 0;
  const unsureParent = of >= 2 && (parent?.agree ?? 0) < 2;
  const status: PurchaseStatus = !anyBuyable ? 'not_listed' : confidence < 0.7 || unsureParent ? 'needs_review' : 'ready';
  const analysis = {
    productType: run.understanding?.productType ?? null,
    category: run.understanding?.category ?? primary.category ?? null,
    parent,
    enablers,
    commodities,
    jurors: run.jurors,
    cached: run.source === 'cache',
    source: run.source,
  };
  const today = new Date().toISOString().slice(0, 10);
  const date = d.date && d.date <= today ? d.date : today;

  await sql`
    UPDATE purchases SET
      status = ${status}, shop = ${d.merchant || 'Receipt'},
      items = ${sql.json(d.items as never)}::jsonb,
      purchased_on = ${date}, amount_local = ${d.total}, currency = ${d.currency},
      fx_rate = ${fx.rate}, fx_source = ${fx.source}, fx_date = ${fx.date},
      amount_usd6 = ${amountUsd6.toString()}::bigint, rate_bps = ${rules.rate_bps},
      invest_usd6 = ${split.investUsd6.toString()}::bigint,
      split = ${sql.json({ maker: rules.split_maker, behind: rules.split_behind, materials: rules.split_materials })}::jsonb,
      analysis = ${sql.json(analysis as never)}::jsonb,
      read_error = NULL, updated_at = now()
    WHERE id = ${purchaseId}::uuid AND user_id = ${userId}::uuid
  `;
  await sql`DELETE FROM allocations WHERE purchase_id = ${purchaseId}::uuid`;
  const whyOf = new Map(rows.filter((r) => r.assetId).map((r) => [r.assetId!, r.why]));
  for (const row of split.rows) {
    await sql`
      INSERT INTO allocations (id, purchase_id, asset_id, role, amount_usd6, selected, why)
      VALUES (${newId()}::uuid, ${purchaseId}::uuid, ${row.assetId}, ${row.role}, ${row.amountUsd6.toString()}::bigint, true, ${whyOf.get(row.assetId) ?? null})
    `;
  }
  await steps.set('resolve', 'done');
  return { status };
}
