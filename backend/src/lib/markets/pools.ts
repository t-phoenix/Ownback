/**
 * D47 pool index: every Solana pool a token trades in, grouped by exchange. One source for "where does this
 * token trade" (Markets, the asset page, suggestions, the buy review) and for which exchanges can be quoted.
 * Display only: money paths still use live Jupiter quotes. Never throws; a miss just means "no data yet".
 */
import { USDC } from '../../shared/chains.js';
import { usdStringToUsd6 } from '../jupiter-price.js';

/** DexScreener exchange id → our label and Jupiter's DEX labels (its `dexes` quote filter). */
export const EXCHANGES: Record<string, { label: string; dexes: string }> = {
  raydium: { label: 'Raydium', dexes: 'Raydium,Raydium CLMM,Raydium CP' },
  orca: { label: 'Orca', dexes: 'Whirlpool' },
  meteora: { label: 'Meteora', dexes: 'Meteora,Meteora DLMM,Meteora DAMM v2,Meteora DLMM Pro' },
  pumpswap: { label: 'PumpSwap', dexes: 'Pump.fun Amm' },
  pancakeswap: { label: 'PancakeSwap', dexes: 'PancakeSwap' },
  fluxbeam: { label: 'FluxBeam', dexes: 'FluxBeam' },
  phoenix: { label: 'Phoenix', dexes: 'Phoenix' },
  saros: { label: 'Saros', dexes: 'Saros,Saros DLMM' },
  stabble: { label: 'Stabble', dexes: 'Stabble CLMM,Stabble Stable Swap,Stabble Weighted Swap' },
};

/** Pools below this are dust: left out of totals and of the exchange list. */
export const MIN_POOL_LIQ_USD = 1_000;
/** An exchange needs this much liquidity before we offer a quote on it. */
export const MIN_QUOTE_LIQ_USD6 = 10_000_000_000n;
/** Under this total, the token is a thin market (D47). */
export const THIN_LIQ_USD6 = 10_000_000_000n;

const QUOTES = new Set([USDC.solana.value, 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 'So11111111111111111111111111111111111111112']);

export type Exchange = {
  key: string; label: string; pools: number;
  liquidityUsd6: bigint; volume24hUsd6: bigint;
  /** Price in the exchange's deepest pool that has the token as base. */
  priceUsd6: bigint | null;
  /** Ownback can quote and swap on it (mapped to Jupiter labels and deep enough). */
  quotable: boolean;
};
export type PoolIndex = { at: number; liquidityUsd6: bigint; volume24hUsd6: bigint; exchanges: Exchange[]; thin: boolean };

type Pair = {
  dexId: string; pairAddress: string; priceUsd?: string;
  baseToken: { address: string }; quoteToken: { address: string };
  liquidity?: { usd?: number }; volume?: { h24?: number };
};

const u6 = (n: number | undefined) => (n && Number.isFinite(n) && n > 0 ? usdStringToUsd6(n.toFixed(6)) : 0n);

/** Pure: DexScreener pairs → pool index for `mint`. Exported for tests. */
export function summarize(mint: string, pairs: Pair[], at = Date.now()): PoolIndex {
  const by = new Map<string, Exchange & { best: bigint }>();
  for (const p of pairs) {
    const base = p.baseToken.address === mint;
    if (!base && p.quoteToken.address !== mint) continue;
    const counter = base ? p.quoteToken.address : p.baseToken.address;
    if (!QUOTES.has(counter) || (p.liquidity?.usd ?? 0) < MIN_POOL_LIQ_USD) continue;
    const liq = u6(p.liquidity?.usd); const vol = u6(p.volume?.h24);
    const e = by.get(p.dexId) ?? { key: p.dexId, label: EXCHANGES[p.dexId]?.label ?? p.dexId, pools: 0, liquidityUsd6: 0n, volume24hUsd6: 0n, priceUsd6: null, quotable: false, best: -1n };
    e.pools++; e.liquidityUsd6 += liq; e.volume24hUsd6 += vol;
    if (base && p.priceUsd && liq > e.best) { e.best = liq; e.priceUsd6 = usdStringToUsd6(p.priceUsd) || null; }
    by.set(p.dexId, e);
  }
  const exchanges = [...by.values()]
    .map(({ best: _b, ...e }) => ({ ...e, quotable: !!EXCHANGES[e.key] && e.liquidityUsd6 >= MIN_QUOTE_LIQ_USD6 }))
    .sort((a, b) => (b.liquidityUsd6 > a.liquidityUsd6 ? 1 : b.liquidityUsd6 < a.liquidityUsd6 ? -1 : 0));
  const liquidityUsd6 = exchanges.reduce((s, e) => s + e.liquidityUsd6, 0n);
  const volume24hUsd6 = exchanges.reduce((s, e) => s + e.volume24hUsd6, 0n);
  return { at, liquidityUsd6, volume24hUsd6, exchanges, thin: liquidityUsd6 < THIN_LIQ_USD6 };
}

// ─── Fetching: DexScreener (free, 300 calls/min) with our own budget ────────────────

const TTL_MS = 10 * 60_000;
const cache = new Map<string, PoolIndex>();
const inflight = new Map<string, Promise<PoolIndex | null>>();
const BUDGET_PER_MIN = 240;
let windowStart = 0; let used = 0; let blockedUntil = 0;

function takeBudget(): boolean {
  const now = Date.now();
  if (now < blockedUntil) return false;
  if (now - windowStart > 60_000) { windowStart = now; used = 0; }
  if (used >= BUDGET_PER_MIN) return false;
  used++; return true;
}

async function fetchIndex(mint: string): Promise<PoolIndex | null> {
  if (!takeBudget()) return null;
  try {
    const res = await fetch(`https://api.dexscreener.com/token-pairs/v1/solana/${mint}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5_000) });
    if (res.status === 429) { blockedUntil = Date.now() + 60_000; return null; }
    if (!res.ok) return null;
    const pairs = (await res.json()) as Pair[];
    const idx = summarize(mint, Array.isArray(pairs) ? pairs : []);
    cache.set(mint, idx);
    return idx;
  } catch { return null; }
}

/** Cached index (no network). Display paths paint from this. */
export function poolIndexCached(mint: string): PoolIndex | null {
  return cache.get(mint) ?? null;
}

/** Fresh-enough index; fetches when missing or older than 10 min. A stale one beats nothing. */
export async function poolIndex(mint: string): Promise<PoolIndex | null> {
  const hit = cache.get(mint);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  let p = inflight.get(mint);
  if (!p) { p = fetchIndex(mint).finally(() => inflight.delete(mint)); inflight.set(mint, p); }
  return (await p) ?? hit ?? null;
}

/** Background sweep (markets worker): refresh the oldest entries within the budget. */
export async function warmPoolIndex(mints: string[], max = 120): Promise<number> {
  const due = mints.filter((m) => { const h = cache.get(m); return !h || Date.now() - h.at > TTL_MS; })
    .sort((a, b) => (cache.get(a)?.at ?? 0) - (cache.get(b)?.at ?? 0)).slice(0, max);
  let n = 0;
  for (const m of due) { if (await fetchIndex(m)) n++; else if (Date.now() < blockedUntil) break; }
  return n;
}

/** Jupiter labels for an exchange the user picked, only if this token's index offers it. */
export function dexesFor(mint: string, key: string): string | null {
  const ex = cache.get(mint)?.exchanges.find((e) => e.key === key);
  return ex?.quotable ? EXCHANGES[key]!.dexes : null;
}

/** Exchange names a Jupiter quote used (its routePlan labels), in our words, e.g. ["Orca", "Raydium"]. */
export function routeExchanges(routePlan: unknown): string[] {
  const labels = Array.isArray(routePlan) ? routePlan.map((p) => String((p as { swapInfo?: { label?: string } })?.swapInfo?.label ?? '')) : [];
  const named = labels.filter(Boolean).map((l) => Object.values(EXCHANGES).find((e) => e.dexes.split(',').includes(l))?.label ?? l);
  return [...new Set(named)];
}

/** Test hook. */
export function _setPoolIndex(mint: string, idx: PoolIndex | null) { if (idx) cache.set(mint, idx); else cache.delete(mint); }
