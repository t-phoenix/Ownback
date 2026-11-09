import { z } from 'zod';

const money = z.string().regex(/^\d+(\.\d{1,2})?$/);

/** ai-spec.md § Schemas. AI output is parsed into these and nothing else. */
export const ReceiptItem = z.object({
  name: z.string(),
  brand: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
  category: z.string().nullable().default(null),
  qty: z.number().int().positive().default(1),
  unitPrice: money.nullable().default(null),
  lineTotal: money.nullable().default(null),
});
export type ReceiptItem = z.infer<typeof ReceiptItem>;

export const ReceiptRead = z.object({
  isReceipt: z.boolean(),
  merchant: z.string().min(1).nullable().default(null),
  place: z.string().nullable().default(null),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  currency: z.string().length(3).nullable().default(null),
  subtotal: money.nullable().default(null),
  tax: money.nullable().default(null),
  total: money.nullable().default(null),
  items: z.array(ReceiptItem).max(30).default([]),
  confidence: z.number().min(0).max(1),
});
export type ReceiptRead = z.infer<typeof ReceiptRead>;

/** The "Check the details" form (api-contract PurchaseDetails). User input, validated at the boundary. */
export const PurchaseDetails = z.object({
  merchant: z.string().trim().max(120).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  currency: z.string().length(3).transform((c) => c.toUpperCase()),
  subtotal: money.optional(),
  tax: money.optional(),
  total: money,
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        brand: z.string().trim().max(80).optional(),
        model: z.string().trim().max(80).optional(),
        category: z.string().trim().max(80).optional(),
        qty: z.number().int().positive().max(999).default(1),
        unitPrice: money.optional(),
        lineTotal: money.optional(),
      }),
    )
    .min(1)
    .max(30),
});
export type PurchaseDetails = z.infer<typeof PurchaseDetails>;

export const Understanding = z.object({
  productType: z.enum(['physical', 'digital', 'service', 'cpg']).catch('physical'),
  category: z.string().max(80).catch('unknown'),
  keyComponents: z.array(z.string().max(80)).catch([]).transform((a) => a.slice(0, 6)),
  deliveryChain: z.array(z.string().max(120)).catch([]).transform((a) => a.slice(0, 6)),
});
export type Understanding = z.infer<typeof Understanding>;

const why = z.string().transform((s) => s.trim().slice(0, 240));
const ticker = z
  .string()
  .nullish()
  .transform((t) => (t && t.trim() && !/^(n\/?a|none|null|private)$/i.test(t.trim()) ? t.trim() : undefined));
const agree = z.number().int().min(0).max(9).catch(1).default(1);

const CompanyRow = z.object({ name: z.string().trim().min(1).max(120), ticker, why });
const EnablerRow = CompanyRow.extend({ role: z.string().max(60).catch('').default('') });
const CommodityRow = z.object({ name: z.string().trim().min(1).max(60), why });

/** One juror's free-form answer. Over-long lists are cut, not rejected. */
export const Ballot = z.object({
  parent: CompanyRow,
  enablers: z.array(EnablerRow).transform((a) => a.slice(0, 5)),
  commodities: z.array(CommodityRow).transform((a) => a.slice(0, 3)),
});
export type Ballot = z.infer<typeof Ballot>;

/** The judge's merged verdict (agreement is recounted in code). */
export const Verdict = z.object({
  parent: CompanyRow.extend({ agree }).nullable(),
  enablers: z.array(EnablerRow.extend({ agree })).transform((a) => a.slice(0, 5)),
  commodities: z.array(CommodityRow.extend({ agree })).transform((a) => a.slice(0, 3)),
});
export type Verdict = z.infer<typeof Verdict>;

/**
 * Pull the JSON object out of a model reply. Models wrap it in fences or write their reasoning first
 * (glm-5.3 does, with `{...}` sketches in the prose), so take the last balanced object that parses.
 */
export function extractJson(text: string): unknown {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]!);
  for (const body of [...fenced.reverse(), text]) {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    try {
      return JSON.parse(body.slice(start, end + 1));
    } catch {
      /* fall through to the balanced scan */
    }
    let best: unknown;
    let bestEnd = -1;
    for (let i = body.indexOf('{'); i >= 0; i = body.indexOf('{', i + 1)) {
      const j = matchBrace(body, i);
      if (j < 0 || j <= bestEnd) continue;
      try {
        best = JSON.parse(body.slice(i, j + 1));
        bestEnd = j;
      } catch {
        /* not JSON */
      }
    }
    if (bestEnd >= 0) return best;
  }
  throw new Error('no_json');
}

/** Index of the `}` closing the `{` at `start`, skipping strings; -1 if unbalanced. */
function matchBrace(s: string, start: number): number {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i;
  }
  return -1;
}

/** Models often print totals with separators ("1,14,900.00") or as numbers; normalise before zod. */
export function normaliseRead(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const r = { ...(raw as Record<string, unknown>) };
  const amount = (v: unknown) => {
    if (v == null) return null;
    const s = String(v).replace(/[^\d.]/g, '');
    const m = s.match(/^\d+(\.\d{1,2})?/);
    return m ? m[0] : null;
  };
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  r.merchant = text(r.merchant ?? r.shop);
  r.place = text(r.place);
  if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) r.date = null;
  r.total = amount(r.total);
  r.subtotal = amount(r.subtotal);
  r.tax = amount(r.tax);
  r.currency = typeof r.currency === 'string' && /^[a-z]{3}$/i.test(r.currency.trim()) ? r.currency.trim().toUpperCase() : null;
  if (Array.isArray(r.items)) {
    r.items = r.items
      .slice(0, 30)
      .map((it) => {
        const i = { ...(it as Record<string, unknown>) };
        i.lineTotal = amount(i.lineTotal);
        i.unitPrice = amount(i.unitPrice);
        const q = Number(i.qty);
        i.qty = Number.isInteger(q) && q > 0 ? q : 1;
        i.name = typeof i.name === 'string' ? i.name.trim() : String(i.name ?? '');
        i.brand = text(i.brand);
        i.model = text(i.model);
        i.category = text(i.category);
        return i;
      })
      .filter((i) => i.name);
  } else r.items = [];
  if (typeof r.isReceipt !== 'boolean') r.isReceipt = true;
  r.confidence = typeof r.confidence === 'number' ? Math.min(1, Math.max(0, r.confidence)) : 0.5;
  return r;
}

/** Fields the form must highlight. total, currency and items block the jury; merchant and date don't. */
export function missingFields(r: Pick<ReceiptRead, 'merchant' | 'date' | 'currency' | 'total' | 'items'>) {
  const m: ('merchant' | 'date' | 'currency' | 'total' | 'items')[] = [];
  if (!r.merchant) m.push('merchant');
  if (!r.date) m.push('date');
  if (!r.currency) m.push('currency');
  if (!r.total || Number(r.total) <= 0) m.push('total');
  if (!r.items.length) m.push('items');
  return m;
}
