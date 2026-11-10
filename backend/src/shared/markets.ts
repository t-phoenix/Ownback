/** Markets constants (docs/12-markets.md, D34–D37). Temporary home until packages/shared (docs/03 O1). */

export const CHART_RANGES = ['1D', '1W', '1M', '3M', '1Y', 'ALL'] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

export const MARKET_SORTS = ['popular', 'gainers', 'losers', 'az'] as const;
export type MarketSort = (typeof MARKET_SORTS)[number];

export const US_MARKET_STATES = ['open', 'closed', 'pre', 'post'] as const;
export type UsMarketState = (typeof US_MARKET_STATES)[number];

/** Where a trade started. `jar` = jar buy (D29); `market` = Markets screen; `holding` = Holding screen sell. */
export const TRADE_SOURCES = ['jar', 'market', 'holding'] as const;
export type TradeSource = (typeof TRADE_SOURCES)[number];

/** Candle interval per range, and how long a cached range stays fresh. */
export const RANGE_SPEC: Record<ChartRange, { interval: '5m' | '1h' | '4h' | '1d'; ttlMs: number; spanMs: number | null }> = {
  '1D': { interval: '5m', ttlMs: 60_000, spanMs: 24 * 3_600_000 },
  '1W': { interval: '1h', ttlMs: 5 * 60_000, spanMs: 7 * 24 * 3_600_000 },
  '1M': { interval: '4h', ttlMs: 15 * 60_000, spanMs: 30 * 24 * 3_600_000 },
  '3M': { interval: '1d', ttlMs: 60 * 60_000, spanMs: 91 * 24 * 3_600_000 },
  '1Y': { interval: '1d', ttlMs: 60 * 60_000, spanMs: 365 * 24 * 3_600_000 },
  ALL: { interval: '1d', ttlMs: 60 * 60_000, spanMs: null },
};

/** Price ticks: how often we store one per hot-set asset, and how long we keep them. */
export const TICK_EVERY_MS = 5 * 60_000;
export const TICK_KEEP_MS = 8 * 24 * 3_600_000;
/** Prices older than this show their age on screen. */
export const PRICE_SHOW_AGE_AFTER_MS = 2 * 60_000;
