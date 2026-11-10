/**
 * Chart candles (D37): Ownback's own price ticks + GeckoTerminal OHLCV for the top pool. Display only:
 * nothing here ever feeds a money calculation. GeckoTerminal's free tier rate-limits hard (S-MKT-1),
 * so every call is cached in Postgres, deduped, and budgeted per minute.
 */
import { getSql } from '../../db/client.js';
import { USDC } from '../../shared/chains.js';
import { RANGE_SPEC, type ChartRange } from '../../shared/markets.js';
import { jupiterPriceCached, usdStringToUsd6 } from '../jupiter-price.js';
import type { MarketAsset } from './catalog.js';

const GT = 'https://api.geckoterminal.com/api/v2/networks/solana';
const SOL_USDC = USDC.solana.value;
const WSOL = 'So11111111111111111111111111111111111111112';

export type Candle = { t: number; o: string; h: string; l: string; c: string };
export type CandleSet = {
  range: ChartRange; interval: string; source: 'ownback' | 'geckoterminal' | 'mixed';
  stale: boolean; candles: Candle[]; reason?: 'not_enough_history' | 'upstream';
};

// ─── GeckoTerminal client: budgeted, timed out, never throws ─────────────────────

const BUDGET_PER_MIN = 20; // free tier is ~30/min shared with anyone on our IP; stay well under
let windowStart = 0; let used = 0; let blockedUntil = 0;

function takeBudget(): boolean {
  const now = Date.now();
  if (now < blockedUntil) return false;
  if (now - windowStart > 60_000) { windowStart = now; used = 0; }
  if (used >= BUDGET_PER_MIN) return false;
  used++; return true;
}

async function gt<T>(path: string): Promise<T | null> {
  if (!takeBudget()) return null;
  try {
    const res = await fetch(`${GT}${path}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(4_000) });
    if (res.status === 429) { blockedUntil = Date.now() + 60_000; return null; }
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch { return null; }
}

/** Display-only float → Usd6 digit string. */
const f6 = (n: number) => (Number.isFinite(n) && n > 0 ? usdStringToUsd6(n.toFixed(6)).toString() : '0');

// ─── Pool resolver ───────────────────────────────────────────────────────────────

type PoolRow = { pool_address: string; volume24h_usd6: string | null; liquidity_usd6: string | null; checked_at: Date };
type GtPools = { data: { attributes: { address: string; reserve_in_usd?: string; volume_usd?: { h24?: string } }; relationships: { base_token: { data: { id: string } }; quote_token: { data: { id: string } }; dex: { data: { id: string } } } }[] };

export async function topPool(mint: string): Promise<PoolRow | null> {
  const sql = getSql();
  const [hit] = await sql<PoolRow[]>`SELECT pool_address, volume24h_usd6::text, liquidity_usd6::text, checked_at FROM market_pools WHERE mint = ${mint}`.catch(() => [] as PoolRow[]);
  if (hit && Date.now() - hit.checked_at.getTime() < 24 * 3_600_000) return hit;
  const body = await gt<GtPools>(`/tokens/${mint}/pools?page=1`);
  const pools = (body?.data ?? []).filter((p) => {
    const base = p.relationships.base_token.data.id.replace(/^solana_/, '');
    const quote = p.relationships.quote_token.data.id.replace(/^solana_/, '');
    return base === mint && (quote === SOL_USDC || quote === WSOL);
  });
  pools.sort((a, b) => Number(b.attributes.reserve_in_usd ?? 0) - Number(a.attributes.reserve_in_usd ?? 0));
  const best = pools[0];
  if (!best) return hit ?? null; // keep an old pool rather than nothing
  const row = {
    pool_address: best.attributes.address,
    liquidity_usd6: f6(Number(best.attributes.reserve_in_usd ?? 0)),
    volume24h_usd6: f6(Number(best.attributes.volume_usd?.h24 ?? 0)),
    checked_at: new Date(),
  };
  await sql`INSERT INTO market_pools (mint, pool_address, dex, liquidity_usd6, volume24h_usd6, checked_at)
    VALUES (${mint}, ${row.pool_address}, ${best.relationships.dex.data.id}, ${row.liquidity_usd6}::bigint, ${row.volume24h_usd6}::bigint, now())
    ON CONFLICT (mint) DO UPDATE SET pool_address = EXCLUDED.pool_address, dex = EXCLUDED.dex,
      liquidity_usd6 = EXCLUDED.liquidity_usd6, volume24h_usd6 = EXCLUDED.volume24h_usd6, checked_at = now()`.catch(() => {});
  return row;
}

// ─── Building candles ────────────────────────────────────────────────────────────

const GT_QUERY: Record<ChartRange, { tf: 'minute' | 'hour' | 'day'; agg: number; limit: number }> = {
  '1D': { tf: 'minute', agg: 5, limit: 288 },
  '1W': { tf: 'hour', agg: 1, limit: 168 },
  '1M': { tf: 'hour', agg: 4, limit: 180 },
  '3M': { tf: 'day', agg: 1, limit: 91 },
  '1Y': { tf: 'day', agg: 1, limit: 365 },
  ALL: { tf: 'day', agg: 1, limit: 1000 },
};
const INTERVAL_MS: Record<string, number> = { '5m': 5 * 60_000, '1h': 3_600_000, '4h': 4 * 3_600_000, '1d': 86_400_000 };

async function fromGecko(mint: string, range: ChartRange): Promise<Candle[] | null> {
  const pool = await topPool(mint);
  if (!pool) return null;
  const q = GT_QUERY[range];
  const body = await gt<{ data: { attributes: { ohlcv_list: number[][] } } }>(
    `/pools/${pool.pool_address}/ohlcv/${q.tf}?aggregate=${q.agg}&limit=${q.limit}&currency=usd&token=base`,
  );
  const list = body?.data?.attributes?.ohlcv_list;
  if (!list) return null;
  return list
    .map(([t, o, h, l, c]) => ({ t: t!, o: f6(o!), h: f6(h!), l: f6(l!), c: f6(c!) }))
    .filter((x) => x.c !== '0')
    .sort((a, b) => a.t - b.t);
}

/** Bucket raw ticks into OHLC candles. Pure; exported for tests. */
export function bucketTicks(ticks: { at: number; usd6: bigint }[], intervalMs: number): Candle[] {
  const out: Candle[] = [];
  let cur: { t: number; o: bigint; h: bigint; l: bigint; c: bigint } | null = null;
  for (const k of [...ticks].sort((a, b) => a.at - b.at)) {
    const t = Math.floor(k.at / intervalMs) * intervalMs;
    if (!cur || cur.t !== t) {
      if (cur) out.push({ t: cur.t / 1000, o: cur.o.toString(), h: cur.h.toString(), l: cur.l.toString(), c: cur.c.toString() });
      cur = { t, o: k.usd6, h: k.usd6, l: k.usd6, c: k.usd6 };
    } else {
      if (k.usd6 > cur.h) cur.h = k.usd6;
      if (k.usd6 < cur.l) cur.l = k.usd6;
      cur.c = k.usd6;
    }
  }
  if (cur) out.push({ t: cur.t / 1000, o: cur.o.toString(), h: cur.h.toString(), l: cur.l.toString(), c: cur.c.toString() });
  return out;
}

async function fromTicks(assetId: string, range: ChartRange): Promise<Candle[]> {
  const spec = RANGE_SPEC[range];
  const span = spec.spanMs ?? 8 * 86_400_000;
  const rows = await getSql()<{ at: Date; usd6: string }[]>`
    SELECT at, usd6::text FROM price_ticks WHERE asset_id = ${assetId} AND at > ${new Date(Date.now() - span)} ORDER BY at`.catch(() => []);
  return bucketTicks(rows.map((r) => ({ at: r.at.getTime(), usd6: BigInt(r.usd6) })), INTERVAL_MS[spec.interval]!);
}

/** The last candle ends at the live price, so the chart and the big number agree. Pure; exported for tests. */
export function withLivePrice(candles: Candle[], live: bigint | null, intervalMs: number, now = Date.now()): Candle[] {
  if (!live || live <= 0n) return candles;
  const t = Math.floor(now / intervalMs) * intervalMs / 1000;
  const last = candles[candles.length - 1];
  const v = live.toString();
  if (last && last.t === t) {
    const h = BigInt(last.h) > live ? last.h : v; const l = BigInt(last.l) < live ? last.l : v;
    return [...candles.slice(0, -1), { ...last, h, l, c: v }];
  }
  if (last && last.t > t) return candles;
  const o = last?.c ?? v;
  const [hi, lo] = BigInt(o) > live ? [o, v] : [v, o];
  return [...candles, { t, o, h: hi, l: lo, c: v }];
}

const inflight = new Map<string, Promise<CandleSet>>();

export function getCandles(a: MarketAsset, range: ChartRange): Promise<CandleSet> {
  const key = `${a.mint}:${range}`;
  const running = inflight.get(key);
  if (running) return running;
  const p = loadCandles(a, range).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function loadCandles(a: MarketAsset, range: ChartRange): Promise<CandleSet> {
  const spec = RANGE_SPEC[range];
  const ivl = INTERVAL_MS[spec.interval]!;
  const live = jupiterPriceCached(a.mint)?.v ?? null;
  const sql = getSql();
  const [cached] = await sql<{ source: CandleSet['source']; payload: Candle[]; fetched_at: Date }[]>`
    SELECT source, payload, fetched_at FROM candle_cache WHERE mint = ${a.mint} AND range = ${range}`.catch(() => []);
  const finish = (candles: Candle[], source: CandleSet['source'], stale: boolean): CandleSet => {
    const withLive = withLivePrice(candles, live, ivl);
    return withLive.length < 2
      ? { range, interval: spec.interval, source, stale, candles: [], reason: 'not_enough_history' }
      : { range, interval: spec.interval, source, stale, candles: withLive };
  };
  if (cached && Date.now() - cached.fetched_at.getTime() < spec.ttlMs) return finish(cached.payload, cached.source, false);

  // 1D prefers our own ticks (every 5 min for the hot set); everything else prefers the pool's history.
  let candles: Candle[] | null = null; let source: CandleSet['source'] = 'geckoterminal';
  if (range === '1D') {
    const ticks = await fromTicks(a.assetId, range);
    if (ticks.length >= 12) { candles = ticks; source = 'ownback'; }
  }
  if (!candles) candles = await fromGecko(a.mint, range);
  if (!candles && (range === '1D' || range === '1W')) {
    const ticks = await fromTicks(a.assetId, range);
    if (ticks.length >= 2) { candles = ticks; source = 'ownback'; }
  }
  if (!candles) {
    if (cached) return finish(cached.payload, cached.source, true); // stale beats nothing
    return { range, interval: spec.interval, source: 'ownback', stale: true, candles: [], reason: 'upstream' };
  }
  await sql`INSERT INTO candle_cache (mint, range, source, payload, fetched_at)
    VALUES (${a.mint}, ${range}, ${source}, ${sql.json(candles as never)}, now())
    ON CONFLICT (mint, range) DO UPDATE SET source = EXCLUDED.source, payload = EXCLUDED.payload, fetched_at = now()`.catch(() => {});
  return finish(candles, source, false);
}
