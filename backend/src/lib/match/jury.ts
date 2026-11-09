/**
 * 0G analysis jury (D30, ai-spec.md § Jury).
 * understand → 3 independent private jurors → judge merges → code recounts agreement.
 * AI only names things; resolve.ts decides what they are and whether they are buyable.
 */
import { getSql } from '../../db/client.js';
import { getCatalogCompany } from '../registry/catalog.js';
import { healthyJuryModels, OG_MODELS, type OgModelConfig } from '../og/models.js';
import { JUDGE, JUROR, JUROR_PERSONAS, UNDERSTAND } from '../og/prompts.js';
import { chatJson } from '../og/runs.js';
import { Ballot, Understanding, Verdict } from '../og/schemas.js';
import { lookupProductGraph, type ProductRow } from './graph.js';
import { normName, rowKey } from './resolve.js';

export type ProductInput = { name: string; brand?: string | null; model?: string | null; category?: string | null; merchant?: string | null };

export type VerdictRow = { name: string; ticker?: string; role?: string; why: string; agree: number };

export type JuryVerdict = {
  understanding: Understanding | null;
  parent: VerdictRow | null;
  enablers: VerdictRow[];
  commodities: VerdictRow[];
  jurors: { model: string; persona: string; ok: boolean }[];
};

export type JuryRun = JuryVerdict & { requestIds: string[]; source: 'jury' | 'cache' | 'seed' };

/** Cache key: brand + name + model, lowercased, punctuation and repeated words dropped. */
export function productKey(p: ProductInput): string {
  const words = normName(`${p.brand ?? ''} ${p.name} ${p.model ?? ''}`, true).split(' ').filter(Boolean);
  return [...new Set(words)].join(' ');
}

function productText(p: ProductInput, u?: Understanding | null) {
  return [
    `PRODUCT: ${p.name}`,
    `BRAND: ${p.brand ?? 'unknown'}`,
    p.model ? `MODEL: ${p.model}` : null,
    p.category ? `CATEGORY: ${p.category}` : null,
    p.merchant ? `SOLD BY: ${p.merchant}` : null,
    u ? `UNDERSTANDING: ${JSON.stringify(u)}` : null,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 2000);
}

type Section = 'parent' | 'enablers' | 'commodities';
const kindOf = (s: Section) => (s === 'commodities' ? 'commodity' : 'company') as 'company' | 'commodity';

function keysIn(b: Ballot, s: Section): string[] {
  if (s === 'parent') return [rowKey('company', b.parent.name, b.parent.ticker)];
  return b[s].map((r) => rowKey(kindOf(s), r.name, 'ticker' in r ? r.ticker : undefined));
}

/** Deterministic merge: majority parent, then most-named enablers / commodities. Used when the judge fails. */
export function mergeBallots(ballots: Ballot[]): Pick<JuryVerdict, 'parent' | 'enablers' | 'commodities'> {
  const tally = (s: Section) => {
    const seen = new Map<string, { row: VerdictRow; n: number; first: number }>();
    let order = 0;
    for (const b of ballots) {
      const rows: VerdictRow[] = s === 'parent' ? [{ ...b.parent, agree: 0 }] : b[s].map((r) => ({ ...r, agree: 0 }));
      const keys = keysIn(b, s);
      new Set(keys).forEach((k) => {
        const row = rows[keys.indexOf(k)]!;
        const cur = seen.get(k);
        if (cur) cur.n++;
        else seen.set(k, { row, n: 1, first: order++ });
      });
    }
    return [...seen.entries()]
      .sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first)
      .map(([key, v]) => ({ key, row: { ...v.row, agree: v.n } }));
  };
  const parent = tally('parent')[0];
  const enablers = tally('enablers').filter((e) => e.key !== parent?.key).slice(0, 5).map((e) => e.row);
  const commodities = tally('commodities').slice(0, 3).map((c) => c.row);
  return { parent: parent?.row ?? null, enablers, commodities };
}

/**
 * Recount agreement from the ballots (the judge's own count is not trusted), drop rows no juror named,
 * drop the parent from enablers, dedupe.
 */
export function applyAgreement(
  v: Pick<JuryVerdict, 'parent' | 'enablers' | 'commodities'>,
  ballots: Ballot[],
): Pick<JuryVerdict, 'parent' | 'enablers' | 'commodities'> {
  const allNames = ballots.flatMap((b) => [b.parent.name, ...b.enablers.map((e) => e.name), ...b.commodities.map((c) => c.name)].map((n) => normName(n)));
  const count = (s: Section, row: VerdictRow) => {
    const key = rowKey(kindOf(s), row.name, row.ticker);
    const n = ballots.filter((b) => keysIn(b, s).includes(key)).length;
    if (n) return { key, n };
    // A private name spelled differently ("Hon Hai" / "Hon Hai Precision") still counts once if a juror said it.
    const nn = normName(row.name);
    return { key, n: allNames.some((a) => a && nn && (a.includes(nn) || nn.includes(a))) ? 1 : 0 };
  };
  // The judge sometimes drops a ticker a juror gave: borrow it so the resolver can match the listing.
  const tickers = ballots.flatMap((b) => [b.parent, ...b.enablers]).filter((x) => x.ticker);
  const borrow = (r: VerdictRow): VerdictRow => {
    if (r.ticker) return r;
    const nn = normName(r.name);
    const hit = tickers.find((x) => normName(x.name) === nn);
    return hit?.ticker ? { ...r, ticker: hit.ticker } : r;
  };
  const fix = (s: Section, rows: VerdictRow[], skip: Set<string>, max: number) => {
    const out: VerdictRow[] = [];
    for (const raw of rows) {
      const r = s === 'commodities' ? raw : borrow(raw);
      const { key, n } = count(s, r);
      if (!n || skip.has(key)) continue;
      skip.add(key);
      out.push({ ...r, agree: n });
      if (out.length === max) break;
    }
    return out;
  };
  const parent = v.parent ? fix('parent', [v.parent], new Set(), 1)[0] ?? null : null;
  const skip = new Set(parent ? [rowKey('company', parent.name, parent.ticker)] : []);
  return { parent, enablers: fix('enablers', v.enablers, skip, 5), commodities: fix('commodities', v.commodities, new Set(), 3) };
}

/** Juror line-up: every healthy pinned model with its own persona, or one model × 3 personas. */
export async function jurorLineup(): Promise<{ model: OgModelConfig; persona: string }[]> {
  const healthy = await healthyJuryModels();
  if (healthy.length >= 3) return healthy.slice(0, 3).map((model, i) => ({ model, persona: JUROR_PERSONAS[i]! }));
  const model = healthy[0] ?? OG_MODELS.llm;
  return JUROR_PERSONAS.map((persona) => ({ model, persona }));
}

type Hooks = { onStep?: (key: 'understand' | 'jury' | 'judge', state: 'running' | 'done' | 'failed') => Promise<void> | void };

/** Run understand → jurors → judge on 0G. Throws only if every juror failed. */
export async function runJury(purchaseId: string | null, p: ProductInput, hooks: Hooks = {}): Promise<JuryRun> {
  const requestIds: string[] = [];
  const step = async (k: 'understand' | 'jury' | 'judge', s: 'running' | 'done' | 'failed') => hooks.onStep?.(k, s);

  await step('understand', 'running');
  let understanding: Understanding | null = null;
  try {
    const { value, res } = await chatJson({
      purchaseId, job: 'understand', promptVersion: UNDERSTAND.version, json: true, maxTokens: 800, timeoutMs: 45_000,
      messages: [{ role: 'system', content: UNDERSTAND.system }, { role: 'user', content: productText(p) }],
      parse: (r) => Understanding.parse(r),
    });
    understanding = value;
    if (res.requestId) requestIds.push(res.requestId);
    await step('understand', 'done');
  } catch {
    await step('understand', 'failed'); // jurors still run on the raw product text
  }

  await step('jury', 'running');
  const lineup = await jurorLineup();
  const results = await Promise.allSettled(
    lineup.map(({ model, persona }) =>
      chatJson({
        // 4k tokens: glm-5.3 writes its reasoning into content before the JSON (1.6k cut it off, 9 Nov).
        purchaseId, job: 'jury', model, promptVersion: JUROR.version, json: true, maxTokens: 4000, timeoutMs: 120_000,
        messages: [{ role: 'system', content: JUROR.system(persona) }, { role: 'user', content: productText(p, understanding) }],
        parse: (r) => Ballot.parse(r),
      }),
    ),
  );
  const ballots: Ballot[] = [];
  const jurors = lineup.map(({ model, persona }, i) => {
    const r = results[i]!;
    if (r.status === 'fulfilled') {
      ballots.push(r.value.value);
      if (r.value.res.requestId) requestIds.push(r.value.res.requestId);
    }
    return { model: model.id, persona, ok: r.status === 'fulfilled' };
  });
  if (!ballots.length) {
    await step('jury', 'failed');
    throw new Error('jury_failed');
  }
  await step('jury', 'done');

  await step('judge', 'running');
  let merged = mergeBallots(ballots);
  if (ballots.length > 1) {
    try {
      const { value, res } = await chatJson({
        purchaseId, job: 'judge', promptVersion: JUDGE.version, json: true, maxTokens: 2000, timeoutMs: 60_000,
        messages: [
          { role: 'system', content: JUDGE.system },
          { role: 'user', content: `${productText(p, understanding)}\n\nBALLOTS:\n${ballots.map((b, i) => `Juror ${i + 1}: ${JSON.stringify(b)}`).join('\n')}` },
        ],
        parse: (r) => Verdict.parse(r),
      });
      if (res.requestId) requestIds.push(res.requestId);
      const judged = applyAgreement(value, ballots);
      // Judge dropped the parent or most rows → keep the vote count instead.
      if (judged.parent && judged.enablers.length >= Math.min(3, merged.enablers.length)) merged = judged;
    } catch {
      /* deterministic merge stands */
    }
  }
  merged = applyAgreement(merged, ballots);
  await step('judge', 'done');
  return { understanding, ...merged, jurors, requestIds, source: 'jury' };
}

// ---- cache (product_analyses) ----

export async function getCachedVerdict(key: string): Promise<JuryVerdict | null> {
  const rows = await getSql()<{ verdict: JuryVerdict }[]>`
    SELECT verdict FROM product_analyses
    WHERE key = ${key} AND source = 'jury' AND updated_at > now() - interval '30 days'
  `;
  return rows[0]?.verdict ?? null;
}

export async function putCachedVerdict(key: string, label: string, v: JuryVerdict, source: 'jury' | 'seed' = 'jury') {
  const sql = getSql();
  const verdict = { understanding: v.understanding, parent: v.parent, enablers: v.enablers, commodities: v.commodities, jurors: v.jurors };
  await sql`
    INSERT INTO product_analyses (key, label, source, verdict, models, created_at, updated_at)
    VALUES (${key}, ${label}, ${source}, ${sql.json(verdict as never)}::jsonb, ${v.jurors.map((j) => j.model)}, now(), now())
    ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, source = EXCLUDED.source, verdict = EXCLUDED.verdict,
      models = EXCLUDED.models, updated_at = now()
    WHERE product_analyses.source = 'seed' OR EXCLUDED.source = 'jury'
  `;
}

/** product-graph.json row → verdict shape (seed rows, used only when the jury can't run). */
export function graphToVerdict(row: ProductRow): JuryVerdict {
  const name = (id: string) => getCatalogCompany(id)?.name ?? id;
  return {
    understanding: null,
    parent: row.makerHint ? { name: row.makerHint, why: `Owns the brand.`, agree: 1 } : null,
    enablers: row.behind.map((b) => ({ name: name(b.assetId), why: b.why, agree: 1 })),
    commodities: row.materials.map((m) => ({ name: name(m.assetId), why: m.why, agree: 1 })),
    jurors: [],
  };
}

/** Seed fallback: product_analyses seed row for the matching graph entry, else the graph file itself. */
export async function seedVerdict(p: ProductInput): Promise<JuryVerdict | null> {
  const row = lookupProductGraph(`${p.name} ${p.model ?? ''}`, p.brand ?? null);
  if (!row) return null;
  try {
    const hit = await getSql()<{ verdict: JuryVerdict }[]>`
      SELECT verdict FROM product_analyses WHERE key = ${normName(row.keys[0]!, true)} AND source = 'seed'
    `;
    if (hit[0]) return hit[0].verdict;
  } catch {
    /* table missing → file */
  }
  return graphToVerdict(row);
}
