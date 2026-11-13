import { USDC } from '../shared/chains.js';

const SOL_USDC = USDC.solana.value;
const JUP_QUOTE = 'https://lite-api.jup.ag/swap/v1/quote';
const JUP_SWAP = 'https://lite-api.jup.ag/swap/v1/swap';
const JUP_PRICE = 'https://lite-api.jup.ag/price/v3';

/** lite-api is rate limited (429). Back off and retry a few times instead of reporting "no route". */
async function jupFetch(url: string, init: RequestInit & { timeoutMs?: number; retries?: number } = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 8_000) });
    if (res.status !== 429 || attempt >= (init.retries ?? 4)) return res;
    await new Promise((r) => setTimeout(r, 1_000 * 2 ** attempt)); // 1, 2, 4, 8 s
  }
}

const priceCache = new Map<string, { v: bigint; at: number }>();
const PRICE_FRESH_MS = 30_000;
/** Display paths may show a price this old while a refresh runs in the background. */
const PRICE_STALE_MS = 10 * 60_000;
/** Mints Jupiter had no price for; display paths skip refetching them for a minute. */
const noPrice = new Map<string, number>();
const NO_PRICE_MS = 60_000;
const BATCH_MAX = 50; // price/v3 takes up to 50 ids per call

// Every price asked for in the same tick goes out as one batched call.
// Separate per-mint calls in parallel hit Jupiter's 429 and the 1-8s backoff above.
let pending: Map<string, ((v: bigint | null) => void)[]> | null = null;
const inflight = new Map<string, Promise<bigint | null>>();

async function fetchBatch(mints: string[]): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>();
  try {
    const res = await jupFetch(`${JUP_PRICE}?ids=${mints.map(encodeURIComponent).join(',')}`, { timeoutMs: 5_000 });
    if (!res.ok) return out;
    const body = (await res.json()) as Record<string, { usdPrice?: string | number; price?: string | number } | null>;
    for (const m of mints) {
      const raw = body[m]?.usdPrice ?? body[m]?.price;
      const v = raw == null ? 0n : usdStringToUsd6(String(raw));
      if (v > 0n) { out.set(m, v); priceCache.set(m, { v, at: Date.now() }); noPrice.delete(m); }
      else noPrice.set(m, Date.now());
      const row = body[m] as { priceChange24h?: number | string; liquidity?: number | string } | null | undefined;
      if (row) metaCache.set(m, { changeBps: pctToBps(row.priceChange24h), liquidityUsd6: row.liquidity == null ? null : usdStringToUsd6(String(row.liquidity)) || null, at: Date.now() });
    }
  } catch { /* null for every mint below */ }
  return out;
}

function flush() {
  const batch = pending!; pending = null;
  const mints = [...batch.keys()];
  for (let i = 0; i < mints.length; i += BATCH_MAX) {
    const chunk = mints.slice(i, i + BATCH_MAX);
    fetchBatch(chunk).then((got) => { for (const m of chunk) for (const r of batch.get(m)!) r(got.get(m) ?? null); });
  }
}

function fetchPrice(mint: string): Promise<bigint | null> {
  const running = inflight.get(mint);
  if (running) return running;
  const p = new Promise<bigint | null>((resolve) => {
    if (!pending) { pending = new Map(); queueMicrotask(flush); }
    const list = pending.get(mint) ?? [];
    list.push(resolve); pending.set(mint, list);
  }).finally(() => inflight.delete(mint));
  inflight.set(mint, p);
  return p;
}

/**
 * Jupiter price → Usd6 per whole token. Never invent; null if the mint has no quote.
 * Default: fresh (≤30s) — use on money paths (buy/sell review).
 * `{ display: true }`: a cached price up to 10 min old comes back at once and refreshes in the background.
 */
export async function jupiterPriceUsd6(mint: string, opts: { display?: boolean } = {}): Promise<bigint | null> {
  const hit = priceCache.get(mint);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age < PRICE_FRESH_MS) return hit.v;
  if (hit && opts.display && age < PRICE_STALE_MS) { void fetchPrice(mint); return hit.v; }
  if (!hit && opts.display && Date.now() - (noPrice.get(mint) ?? 0) < NO_PRICE_MS) return null;
  return fetchPrice(mint);
}

/** The cached price and when it was fetched, without any network call (Markets list paints from this). */
export function jupiterPriceCached(mint: string): { v: bigint; at: number } | null {
  return priceCache.get(mint) ?? null;
}

/** 24h change and pool liquidity that came with the last batched price (display only; Markets). */
export type PriceMeta = { changeBps: number | null; liquidityUsd6: bigint | null; at: number };
const metaCache = new Map<string, PriceMeta>();
export function jupiterPriceMeta(mint: string): PriceMeta | null {
  return metaCache.get(mint) ?? null;
}

/** Jupiter's percent (a JSON number like 2.0424) → whole basis points. Display only. */
export function pctToBps(p: number | string | null | undefined): number | null {
  if (p == null || p === '') return null;
  const n = Number(p);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Many prices in one round trip (display). */
export async function jupiterPricesUsd6(mints: string[], opts: { display?: boolean } = {}): Promise<Map<string, bigint>> {
  const vals = await Promise.all(mints.map((m) => jupiterPriceUsd6(m, opts)));
  const out = new Map<string, bigint>();
  mints.forEach((m, i) => { if (vals[i] != null) out.set(m, vals[i]!); });
  return out;
}

/** "236.41" → micro-USDC. Digit string only; no float maths on the money path. */
export function usdStringToUsd6(s: string): bigint {
  let cleaned = s.trim();
  // The price API sends JSON numbers; tiny ones arrive as "1.2e-7". Normalise to fixed 6dp first.
  if (/^\d+(\.\d+)?e[-+]?\d+$/i.test(cleaned)) cleaned = Number(cleaned).toFixed(6);
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return 0n;
  const [w, f = ''] = cleaned.split('.');
  return BigInt(w) * 1_000_000n + BigInt((f + '000000').slice(0, 6));
}

/** Whole-token qty string from spend and unit price (both Usd6). Display only. */
export function qtyFromSpend(amountUsd6: bigint, priceUsd6: bigint): string {
  if (priceUsd6 <= 0n || amountUsd6 <= 0n) return '0';
  const q6 = (amountUsd6 * 1_000_000n) / priceUsd6;
  const whole = q6 / 1_000_000n;
  const frac = (q6 % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** Raw token amount → whole-token decimal string using mint decimals. */
export function rawToQty(raw: bigint, decimals: number): string {
  if (decimals < 0 || decimals > 18) return '0';
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = (raw % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** Usd6 spend → USDC raw (6 decimals). Whole cents only on invest path; here exact micro-USDC. */
export function usdcRawFromUsd6(amountUsd6: bigint): bigint {
  return amountUsd6; // USDC raw units === Usd6
}

export type JupiterQuote = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  routePlan: unknown;
  /** Full Jupiter quoteResponse for /swap */
  raw: Record<string, unknown>;
};

/** Live Jupiter swap quote. Never invent mints — caller passes verified addresses only. */
export async function jupiterQuote(opts: {
  inputMint: string;
  outputMint: string;
  amountRaw: bigint;
  slippageBps?: number;
  /** 429 retries (default 4, waits 1-2-4-8 s). Fee measurements use 1 so a review never waits long. */
  retries?: number;
}): Promise<JupiterQuote | null> {
  if (opts.amountRaw <= 0n) return null;
  try {
    const url =
      `${JUP_QUOTE}?inputMint=${encodeURIComponent(opts.inputMint)}` +
      `&outputMint=${encodeURIComponent(opts.outputMint)}` +
      `&amount=${opts.amountRaw.toString()}` +
      `&slippageBps=${opts.slippageBps ?? 100}`;
    const res = await jupFetch(url, { retries: opts.retries });
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, unknown>;
    if (!body.outAmount || !body.inAmount) return null;
    return {
      inputMint: String(body.inputMint ?? opts.inputMint),
      outputMint: String(body.outputMint ?? opts.outputMint),
      inAmount: String(body.inAmount),
      outAmount: String(body.outAmount),
      otherAmountThreshold: String(body.otherAmountThreshold ?? body.outAmount),
      priceImpactPct: String(body.priceImpactPct ?? '0'),
      routePlan: body.routePlan,
      raw: body,
    };
  } catch {
    return null;
  }
}

export async function jupiterBuyQuote(mint: string, amountUsd6: bigint, slippageBps = 100, retries?: number) {
  return jupiterQuote({
    inputMint: SOL_USDC,
    outputMint: mint,
    amountRaw: usdcRawFromUsd6(amountUsd6),
    slippageBps,
    retries,
  });
}

/** $1 USDC→mint route probe: true = route, false = Jupiter says NO_ROUTES_FOUND, null = couldn't ask (429, timeout, 5xx). */
export async function jupiterRouteOk(mint: string): Promise<boolean | null> {
  try {
    const res = await jupFetch(`${JUP_QUOTE}?inputMint=${SOL_USDC}&outputMint=${encodeURIComponent(mint)}&amount=1000000&slippageBps=100`);
    if (res.ok) return !!((await res.json()) as { outAmount?: string }).outAmount;
    if (res.status !== 400) return null;
    const body = (await res.json().catch(() => ({}))) as { errorCode?: string };
    return /NO_ROUTES|COULD_NOT_FIND|TOKEN_NOT_TRADABLE/.test(body.errorCode ?? '') ? false : null;
  } catch {
    return null;
  }
}

export async function jupiterSellQuote(mint: string, amountRaw: bigint, slippageBps = 100, retries?: number) {
  return jupiterQuote({
    inputMint: mint,
    outputMint: SOL_USDC,
    amountRaw,
    slippageBps,
    retries,
  });
}

/** Unit price Usd6 from a buy quote (USDC in → tokens out). */
export function priceUsd6FromBuyQuote(inUsd6: bigint, outRaw: bigint, decimals: number): bigint {
  if (outRaw <= 0n || inUsd6 <= 0n) return 0n;
  const base = 10n ** BigInt(decimals);
  // price per whole token = inUsd6 * 10^decimals / outRaw
  return (inUsd6 * base) / outRaw;
}

/** Value of a raw token amount at a Usd6-per-whole-token price. */
export function valueUsd6(raw: bigint, decimals: number, priceUsd6: bigint): bigint {
  return (raw * priceUsd6) / 10n ** BigInt(decimals);
}

/**
 * One-way swap cost = half of what a round trip at this size loses (pool fee + price impact each way).
 * Measured from two live quotes, so it doesn't depend on a reference price that can lag the pool.
 * `sent` and `back` are in the same unit (the side the trip starts from). Pure; exported for tests.
 */
export function halfRoundTrip(sent: bigint, back: bigint): bigint {
  return sent > back ? (sent - back) / 2n : 0n;
}

// The measured rate barely moves between quotes of a similar size, so it is reused for a minute per token,
// side and order size (power of ten in dollars). Saves one Jupiter call per refresh (lite-api rate limits).
const costCache = new Map<string, { at: number; ppm: bigint }>();
const COST_TTL_MS = 5 * 60_000;
const sizeBucket = (usd6: bigint) => usd6.toString().length;

async function cachedCost(key: string, amountUsd6: bigint, measure: () => Promise<bigint | null>): Promise<bigint | null> {
  const hit = costCache.get(key);
  if (hit && Date.now() - hit.at < COST_TTL_MS) return (amountUsd6 * hit.ppm) / 1_000_000n;
  const cost = await measure();
  if (cost != null && amountUsd6 > 0n) costCache.set(key, { at: Date.now(), ppm: (cost * 1_000_000n) / amountUsd6 });
  // Rate limited or no route right now: the last measured rate beats the reference-price fallback.
  return cost ?? (hit ? (amountUsd6 * hit.ppm) / 1_000_000n : null);
}

/** Buy cost in Usd6: spend USDC → outRaw tokens; selling outRaw back returns less USDC. null when the reverse quote fails. */
export async function buySwapCostUsd6(mint: string, spendUsd6: bigint, outRaw: bigint): Promise<bigint | null> {
  if (outRaw <= 0n) return null;
  return cachedCost(`${mint}:buy:${sizeBucket(spendUsd6)}`, spendUsd6, async () => {
    const back = await jupiterSellQuote(mint, outRaw, 100, 1);
    return back ? halfRoundTrip(spendUsd6, BigInt(back.outAmount)) : null;
  });
}

/** Sell cost in Usd6: amountRaw tokens → outUsd6; buying back with outUsd6 returns fewer tokens, valued at this sell's price. */
export async function sellSwapCostUsd6(mint: string, amountRaw: bigint, outUsd6: bigint): Promise<bigint | null> {
  if (amountRaw <= 0n || outUsd6 <= 0n) return null;
  return cachedCost(`${mint}:sell:${sizeBucket(outUsd6)}`, outUsd6, async () => {
    const back = await jupiterBuyQuote(mint, outUsd6, 100, 1);
    return back ? (halfRoundTrip(amountRaw, BigInt(back.outAmount)) * outUsd6) / amountRaw : null;
  });
}

/**
 * Raw tokens to sell for about `targetUsd6`. Jupiter has no exact-out route for these tokens, so: size from the
 * reference price, quote it, rescale by what the pool actually pays, and quote again. Lands within a few bps.
 * Returns the final amount and its quote (capped at `held`). Pure maths in `rescale` (exported for tests).
 */
export function rescale(raw: bigint, gotUsd6: bigint, targetUsd6: bigint): bigint {
  return gotUsd6 > 0n ? (raw * targetUsd6) / gotUsd6 : raw;
}

export async function sizeSellForUsd6(mint: string, targetUsd6: bigint, held: bigint, decimals: number, refPriceUsd6: bigint | null) {
  if (!refPriceUsd6 || refPriceUsd6 <= 0n) return null;
  let raw = (targetUsd6 * 10n ** BigInt(decimals)) / refPriceUsd6;
  if (raw > held) raw = held;
  if (raw <= 0n) return null;
  const first = await jupiterSellQuote(mint, raw);
  if (!first) return null;
  const got = BigInt(first.outAmount);
  // Within 0.05% already: one quote is enough.
  if ((got > targetUsd6 ? got - targetUsd6 : targetUsd6 - got) * 10_000n <= targetUsd6 * 5n) return { amountRaw: raw, quote: first };
  let next = rescale(raw, got, targetUsd6);
  if (next > held) next = held;
  if (next <= 0n || next === raw) return { amountRaw: raw, quote: first };
  const second = await jupiterSellQuote(mint, next);
  return second ? { amountRaw: next, quote: second } : { amountRaw: raw, quote: first };
}

/**
 * Route cost = what goes in minus what comes out, both valued in Usd6 at Jupiter's price.
 * Measured, not Jupiter's priceImpactPct (whose scale is ambiguous). Never negative.
 */
export function routeFeeUsd6(inUsd6: bigint, outUsd6: bigint): bigint {
  return inUsd6 > outUsd6 ? inUsd6 - outUsd6 : 0n;
}

export async function jupiterBuildSwap(opts: {
  quoteResponse: Record<string, unknown>;
  userPublicKey: string;
  payer: string;
  destinationTokenAccount?: string;
}): Promise<string | null> {
  try {
    const res = await jupFetch(JUP_SWAP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: opts.quoteResponse,
        userPublicKey: opts.userPublicKey,
        payer: opts.payer,
        ...(opts.destinationTokenAccount ? { destinationTokenAccount: opts.destinationTokenAccount } : {}),
        wrapAndUnwrapSol: false,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }),
      timeoutMs: 15_000,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { swapTransaction?: string; simulationError?: { error?: string } | string | null };
    // Jupiter often still returns a tx when sim fails (e.g. Token-2022 ATA). Don't ask the user to sign a dead tx.
    if (body.simulationError) return null;
    return body.swapTransaction ?? null;
  } catch {
    return null;
  }
}

export { SOL_USDC };
