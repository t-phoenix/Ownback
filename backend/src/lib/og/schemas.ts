import { z } from 'zod';

/** ai-spec.md § Schemas. AI output is parsed into these and nothing else. */
export const ReceiptRead = z.object({
  isReceipt: z.boolean(),
  shop: z.string().min(1).nullable(),
  place: z.string().nullable().default(null),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  currency: z.string().length(3).nullable(),
  total: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable(),
  items: z
    .array(
      z.object({
        name: z.string(),
        brand: z.string().nullable().default(null),
        qty: z.number().int().positive().default(1),
        lineTotal: z.string().nullable().default(null),
      }),
    )
    .max(30)
    .default([]),
  isProduct: z.boolean().default(true),
  confidence: z.number().min(0).max(1),
});
export type ReceiptRead = z.infer<typeof ReceiptRead>;

export const MakerMatch = z.object({
  brand: z.string(),
  companyId: z.string().nullable(),
  companyName: z.string().nullable(),
  listed: z.boolean(),
  confidence: z.number().min(0).max(1),
  evidence: z.string().max(200),
});
export type MakerMatch = z.infer<typeof MakerMatch>;

/** Pull the first JSON object out of a model reply (models sometimes wrap it in prose or fences). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1]! : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no_json');
  return JSON.parse(body.slice(start, end + 1));
}

/** Models often print totals with separators ("1,14,900.00") or as numbers; normalise before zod. */
export function normaliseRead(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const r = { ...(raw as Record<string, unknown>) };
  const money = (v: unknown) => {
    if (v == null) return null;
    const s = String(v).replace(/[^\d.]/g, '');
    const m = s.match(/^\d+(\.\d{1,2})?/);
    return m ? m[0] : null;
  };
  r.total = money(r.total);
  if (typeof r.currency === 'string') r.currency = r.currency.trim().toUpperCase().slice(0, 3);
  if (Array.isArray(r.items)) {
    r.items = r.items.slice(0, 30).map((it) => {
      const i = { ...(it as Record<string, unknown>) };
      i.lineTotal = money(i.lineTotal);
      const q = Number(i.qty);
      i.qty = Number.isInteger(q) && q > 0 ? q : 1;
      if (typeof i.name !== 'string') i.name = String(i.name ?? '');
      return i;
    });
  }
  if (typeof r.confidence !== 'number') r.confidence = 0.5;
  return r;
}
