/**
 * Display-only market stats for suggestion rows (D43): Jupiter token data (price, market value, 24h volume,
 * liquidity) and the gap from the real share price. Never feeds money maths; any failure just hides the number.
 */
import { JUP_BASE, jupFetch, usdStringToUsd6 } from './jupiter-price.js';
import { poolIndex } from './markets/pools.js';

/** Liquidity and volume are summed across every exchange (D47 pool index) when it answers in time; Jupiter's otherwise. */
export type TokenStats = { priceUsd6: bigint | null; mcapUsd6: bigint | null; volume24hUsd6: bigint | null; liquidityUsd6: bigint | null; exchanges?: number; thin?: boolean };

const within = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms).unref?.())]);

const TTL_MS = 10 * 60_000;
const statsCache = new Map<string, { at: number; v: TokenStats }>();
const refCache = new Map<string, { at: number; v: bigint | null }>();

const usd6 = (n: unknown): bigint | null => {
  const x = Number(n);
  return Number.isFinite(x) && x > 0 ? usdStringToUsd6(x.toFixed(6)) : null;
};

/** Jupiter token stats for many mints in one call (tokens/v2 takes up to 100 ids). */
export async function tokenStats(mints: string[]): Promise<Map<string, TokenStats>> {
  const out = new Map<string, TokenStats>();
  const need = mints.filter((m) => {
    const hit = statsCache.get(m);
    if (hit && Date.now() - hit.at < TTL_MS) out.set(m, hit.v);
    return !out.has(m);
  });
  for (let i = 0; i < need.length; i += 100) {
    const chunk = need.slice(i, i + 100);
    try {
      const res = await jupFetch(`${JUP_BASE}/tokens/v2/search?query=${chunk.join(',')}`, { timeoutMs: 6_000, retries: 1 });
      if (!res.ok) continue;
      const rows = (await res.json()) as { id: string; usdPrice?: number; mcap?: number; liquidity?: number; stats24h?: { buyVolume?: number; sellVolume?: number } }[];
      for (const r of rows) {
        if (!chunk.includes(r.id)) continue;
        const vol = (r.stats24h?.buyVolume ?? 0) + (r.stats24h?.sellVolume ?? 0);
        const v = { priceUsd6: usd6(r.usdPrice), mcapUsd6: usd6(r.mcap), volume24hUsd6: usd6(vol), liquidityUsd6: usd6(r.liquidity) };
        statsCache.set(r.id, { at: Date.now(), v });
        out.set(r.id, v);
      }
    } catch { /* hidden */ }
  }
  const idx = await Promise.all(mints.map((m) => within(poolIndex(m), 1_500).catch(() => null)));
  mints.forEach((m, i) => {
    const x = idx[i];
    if (!x) return;
    out.set(m, { ...(out.get(m) ?? { priceUsd6: null, mcapUsd6: null }), liquidityUsd6: x.liquidityUsd6 || null, volume24hUsd6: x.volume24hUsd6 || null, exchanges: x.exchanges.length, thin: x.thin });
  });
  return out;
}

/**
 * Last US share price per ticker. shortcut: Yahoo's public spark endpoint (no key, unofficial, display only);
 * swap for a keyed feed (Pyth Hermes now needs a key) if it breaks or before using it for money.
 */
export async function refPrices(tickers: string[]): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>();
  const need = [...new Set(tickers)].filter((t) => {
    const hit = refCache.get(t);
    if (hit && Date.now() - hit.at < TTL_MS) { if (hit.v) out.set(t, hit.v); return false; }
    return /^[A-Z][A-Z0-9.-]{0,9}$/.test(t);
  });
  for (let i = 0; i < need.length; i += 20) {
    const chunk = need.slice(i, i + 20);
    try {
      const res = await fetch(`https://query1.finance.yahoo.com/v7/finance/spark?symbols=${chunk.join(',')}&range=1d&interval=1d`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6_000),
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { spark?: { result?: { symbol: string; response?: { meta?: { regularMarketPrice?: number; currency?: string } }[] }[] } };
      for (const r of body.spark?.result ?? []) {
        const meta = r.response?.[0]?.meta;
        const v = meta?.currency === 'USD' ? usd6(meta.regularMarketPrice) : null;
        refCache.set(r.symbol, { at: Date.now(), v });
        if (v) out.set(r.symbol, v);
      }
    } catch { /* hidden */ }
  }
  return out;
}

/** Token price vs share price in bps; null when unknown or so far off it's probably a different listing. Pure. */
export function gapBps(price: bigint | null, ref: bigint | null | undefined): number | null {
  if (!price || !ref) return null;
  const bps = Number(((price - ref) * 10_000n) / ref);
  return Math.abs(bps) > 5_000 ? null : bps;
}
