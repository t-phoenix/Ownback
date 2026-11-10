/**
 * Markets price reads (D38): everything comes from the shared batched Jupiter cache in jupiter-price.ts.
 * Requests never wait more than 2.5 s; the background worker keeps the cache warm (jobs.ts).
 */
import { getSql } from '../../db/client.js';
import { jupiterPriceCached, jupiterPriceMeta, jupiterPricesUsd6 } from '../jupiter-price.js';
import { TICK_EVERY_MS } from '../../shared/markets.js';
import { marketAssets, type MarketAsset } from './catalog.js';

export const WAIT_CAP_MS = 2_500;

export type MarketPrice = { priceUsd6: bigint | null; at: number | null; changeBps: number | null; liquidityUsd6: bigint | null };

/** Resolve after `ms` with undefined: lets a request stop waiting on Jupiter without failing. */
export const capWait = <T>(p: Promise<T>, ms = WAIT_CAP_MS): Promise<T | undefined> =>
  Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms).unref?.())]);

/** Prices for these markets. Misses are fetched (batched) for at most 2.5 s; whatever is cached then is returned. */
export async function marketPrices(list: MarketAsset[]): Promise<Map<string, MarketPrice>> {
  const missing = list.filter((a) => !jupiterPriceCached(a.mint)).map((a) => a.mint);
  if (missing.length) await capWait(jupiterPricesUsd6(missing, { display: true }).catch(() => null));
  const out = new Map<string, MarketPrice>();
  for (const a of list) {
    const p = jupiterPriceCached(a.mint);
    const meta = jupiterPriceMeta(a.mint);
    out.set(a.assetId, { priceUsd6: p?.v ?? null, at: p?.at ?? null, changeBps: meta?.changeBps ?? null, liquidityUsd6: meta?.liquidityUsd6 ?? null });
  }
  return out;
}

// ─── Hot set: the assets we keep tick history for ───────────────────────────────

const viewed = new Map<string, number>();
const VIEW_KEEP_MS = 30 * 60_000;
export function markViewed(assetId: string) { viewed.set(assetId, Date.now()); }

/** Top assets by pool liquidity + recently viewed + recently bought (bounded; ticks are not free). */
export async function hotSet(limit = 150): Promise<MarketAsset[]> {
  const all = marketAssets();
  const byLiq = [...all].sort((x, y) => {
    const a = jupiterPriceMeta(x.mint)?.liquidityUsd6 ?? 0n, b = jupiterPriceMeta(y.mint)?.liquidityUsd6 ?? 0n;
    return a === b ? 0 : b > a ? 1 : -1;
  }).slice(0, limit);
  const ids = new Set(byLiq.map((a) => a.assetId));
  for (const [id, at] of viewed) { if (Date.now() - at > VIEW_KEEP_MS) viewed.delete(id); else ids.add(id); }
  try {
    const rows = await getSql()<{ asset_id: string }[]>`
      SELECT DISTINCT asset_id FROM buy_entries WHERE status = 'bought' AND id IN (
        SELECT e.id FROM buy_entries e JOIN buy_batches b ON b.id = e.batch_id WHERE b.started_at > now() - interval '30 days')`;
    for (const r of rows) ids.add(r.asset_id);
  } catch { /* no DB: liquidity + viewed only */ }
  return all.filter((a) => ids.has(a.assetId));
}

/** One tick per hot asset per 5-min bucket. Idempotent across instances (bucketed `at` + ON CONFLICT). */
export async function writeTicks(list: MarketAsset[], now = Date.now()): Promise<number> {
  const at = new Date(Math.floor(now / TICK_EVERY_MS) * TICK_EVERY_MS);
  const ids: string[] = []; const vals: string[] = [];
  for (const a of list) {
    const p = jupiterPriceCached(a.mint);
    if (p && now - p.at < 2 * TICK_EVERY_MS) { ids.push(a.assetId); vals.push(p.v.toString()); }
  }
  if (!ids.length) return 0;
  await getSql()`INSERT INTO price_ticks (asset_id, at, usd6)
    SELECT id, ${at}, v::bigint FROM unnest(${ids}::text[], ${vals}::text[]) AS t(id, v) ON CONFLICT DO NOTHING`;
  return ids.length;
}

// ─── Sparklines (24 hourly closes from our ticks) ────────────────────────────────

let sparkMemo: { at: number; map: Map<string, bigint[]> } | null = null;
const SPARK_MEMO_MS = 60_000;

export async function sparklines(): Promise<Map<string, bigint[]>> {
  if (sparkMemo && Date.now() - sparkMemo.at < SPARK_MEMO_MS) return sparkMemo.map;
  const map = new Map<string, bigint[]>();
  try {
    const rows = await getSql()<{ asset_id: string; h: Date; usd6: string }[]>`
      SELECT DISTINCT ON (asset_id, date_trunc('hour', at)) asset_id, date_trunc('hour', at) AS h, usd6::text
      FROM price_ticks WHERE at > now() - interval '24 hours'
      ORDER BY asset_id, date_trunc('hour', at), at DESC`;
    for (const r of rows) { const l = map.get(r.asset_id) ?? []; l.push(BigInt(r.usd6)); map.set(r.asset_id, l); }
  } catch { /* table missing or DB down: no sparklines, list still works */ }
  sparkMemo = { at: Date.now(), map };
  return map;
}
