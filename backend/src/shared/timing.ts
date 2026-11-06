/** docs/04 timing constants. Temporary until packages/shared. */

export const DEPOSIT_POLL_MS = 5_000;
export const DEPOSIT_SLOW_AFTER_MS = 180_000;
export const DEPOSIT_SLOW_POLL_MS = 30_000;
export const MIN_DEPOSIT_USD6 = 1_000_000n;
export const READING_POLL_MS = 700;
export const QUOTE_REFRESH_MS = 30_000;
export const PRICE_REFRESH_MS = 60_000;
export const PRICE_STALE_AFTER_MS = 300_000;
export const SKELETON_MAX_MS = 2_000;
export const JAR_READY_USD6 = 5_000_000n;
export const DEFAULT_MAX_FEE_BPS = 500;
export const APPROVAL_TTL_MS = 1_800_000;
export const MAX_SLIPPAGE_BPS = 100;
export const SWAP_RETRIES = 2;
export const BRIDGE_SLOW_AFTER_MS = 180_000;
export const GMAIL_WINDOW_DAYS = 30;
export const GMAIL_MAX_PER_RUN = 50;
export const CENT_USD6 = 10_000n;
export const SESSION_SLIDE_MS = 24 * 60 * 60 * 1000;
export const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;
