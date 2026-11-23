import { companyOf, tokenAssetsOf, verifiedMint } from '../../shared/assets.js';
import { DEFAULT_MAX_FEE_BPS, JAR_READY_USD6 } from '../../shared/timing.js';
import { toUsd6, type Usd6 } from '../../shared/money.js';
import { getCatalogCompany } from '../registry/catalog.js';
import { jupiterBuyQuote, jupiterPriceUsd6, routeFeeUsd6, valueUsd6 } from '../jupiter-price.js';
import { gapBps, refPrices, tokenStats } from '../token-stats.js';

/** One token (its own asset, D45) of a company, as a suggestion shows it. Stats are display only. */
export type VenueStat = {
  assetId: string;
  symbol: string;
  issuer: string;
  tradable: boolean;
  /** Cost of a jar-sized ($5) buy right now, in bps of the amount; null when it couldn't be measured. */
  feeBps: number | null;
  priceUsd6?: Usd6;
  mcapUsd6?: Usd6;
  volume24hUsd6?: Usd6;
  liquidityUsd6?: Usd6;
  /** Token price vs the real share price, bps. */
  gapBps?: number;
};

export type Buyable = {
  /** The best token's asset id (what a jar for this company uses by default). */
  assetId: string;
  buyable: boolean;
  mint?: string;
  decimals?: number;
  symbol?: string;
  /** Best first: tradable, then cheapest. */
  venues?: VenueStat[];
};

type Probe = { at: number; feeBps: number | null; ok: boolean };
const probeCache = new Map<string, Probe>();
const PROBE_TTL_MS = 300_000;
// One quote at a time: a read resolves ~9 rows at once, and a burst trips lite-api's 429.
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(f: () => Promise<T>): Promise<T> => {
  const p = queue.then(f, f);
  queue = p.catch(() => {});
  return p;
};

/**
 * D43 tradable = a live $5 quote whose cost fits the default fee cap, the same rule the buy screen enforces
 * (a route alone isn't enough: AALon had a route that lost 72% on $1). Unanswered quotes aren't cached.
 */
async function probe(mint: string, decimals: number): Promise<Probe> {
  const hit = probeCache.get(mint);
  if (hit && Date.now() - hit.at < PROBE_TTL_MS) return hit;
  const [quote, price] = await Promise.all([serial(() => jupiterBuyQuote(mint, JAR_READY_USD6, 100, 2)), jupiterPriceUsd6(mint)]);
  if (!quote || !price) return { at: Date.now(), feeBps: null, ok: false };
  const fee = routeFeeUsd6(JAR_READY_USD6, valueUsd6(BigInt(quote.outAmount), decimals, price));
  const feeBps = Number((fee * 10_000n) / JAR_READY_USD6);
  const p = { at: Date.now(), feeBps, ok: feeBps <= DEFAULT_MAX_FEE_BPS };
  probeCache.set(mint, p);
  return p;
}

/** Best tradable token of a company across its token assets, with display stats for each. Never invents mints. */
export async function checkBuyable(companyId: string): Promise<Buyable> {
  const tokens = tokenAssetsOf(companyOf(companyId), 'solana').map((a) => ({ a, m: verifiedMint(a.assetId, 'solana')! }));
  if (!tokens.length) return { assetId: companyId, buyable: false };
  const ticker = getCatalogCompany(companyOf(companyId))?.ticker ?? null;
  const [probes, stats, refs] = await Promise.all([
    Promise.all(tokens.map(({ m }) => probe(m.mint, m.decimals))),
    tokenStats(tokens.map(({ m }) => m.mint)),
    ticker ? refPrices([ticker]) : Promise.resolve(new Map<string, bigint>()),
  ]);
  const ref = ticker ? refs.get(ticker) : undefined;
  const rows = tokens.map(({ a, m }, i) => {
    const s = stats.get(m.mint);
    const gap = gapBps(s?.priceUsd6 ?? null, ref);
    const v: VenueStat = {
      assetId: a.assetId, symbol: m.symbol, issuer: m.issuer, tradable: probes[i]!.ok, feeBps: probes[i]!.feeBps,
      ...(s?.priceUsd6 ? { priceUsd6: toUsd6(s.priceUsd6) } : {}),
      ...(s?.mcapUsd6 ? { mcapUsd6: toUsd6(s.mcapUsd6) } : {}),
      ...(s?.volume24hUsd6 ? { volume24hUsd6: toUsd6(s.volume24hUsd6) } : {}),
      ...(s?.liquidityUsd6 ? { liquidityUsd6: toUsd6(s.liquidityUsd6) } : {}),
      ...(gap != null ? { gapBps: gap } : {}),
    };
    return { m, v };
  });
  rows.sort((a, b) => Number(b.v.tradable) - Number(a.v.tradable) || (a.v.feeBps ?? 1e9) - (b.v.feeBps ?? 1e9));
  const best = rows[0]!;
  return {
    assetId: best.v.assetId,
    buyable: best.v.tradable,
    mint: best.m.mint,
    decimals: best.m.decimals,
    symbol: best.m.symbol,
    venues: rows.map((r) => r.v),
  };
}

/** Test hook. */
export function _resetRouteCache() {
  probeCache.clear();
}
