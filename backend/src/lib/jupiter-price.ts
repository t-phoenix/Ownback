import { USDC } from '../shared/chains.js';

const SOL_USDC = USDC.solana.value;
const JUP_QUOTE = 'https://lite-api.jup.ag/swap/v1/quote';
const JUP_SWAP = 'https://lite-api.jup.ag/swap/v1/swap';
const JUP_PRICE = 'https://lite-api.jup.ag/price/v3';

/** lite-api is rate limited (429). Back off and retry a few times instead of reporting "no route". */
async function jupFetch(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 8_000) });
    if (res.status !== 429 || attempt >= 4) return res;
    await new Promise((r) => setTimeout(r, 1_000 * 2 ** attempt)); // 1, 2, 4, 8 s
  }
}

const priceCache = new Map<string, { v: bigint; at: number }>();
const PRICE_TTL_MS = 15_000;

/** Jupiter price → Usd6 per whole token. Never invent; null if the mint has no quote. */
export async function jupiterPriceUsd6(mint: string): Promise<bigint | null> {
  const hit = priceCache.get(mint);
  if (hit && Date.now() - hit.at < PRICE_TTL_MS) return hit.v;
  try {
    const res = await jupFetch(`${JUP_PRICE}?ids=${encodeURIComponent(mint)}`, { timeoutMs: 5_000 });
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, { usdPrice?: string | number; price?: string | number } | null>;
    const row = body[mint];
    const raw = row?.usdPrice ?? row?.price;
    if (raw == null) return null;
    const v = usdStringToUsd6(String(raw));
    if (v > 0n) priceCache.set(mint, { v, at: Date.now() });
    return v;
  } catch {
    return null;
  }
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
}): Promise<JupiterQuote | null> {
  if (opts.amountRaw <= 0n) return null;
  try {
    const url =
      `${JUP_QUOTE}?inputMint=${encodeURIComponent(opts.inputMint)}` +
      `&outputMint=${encodeURIComponent(opts.outputMint)}` +
      `&amount=${opts.amountRaw.toString()}` +
      `&slippageBps=${opts.slippageBps ?? 100}`;
    const res = await jupFetch(url);
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

export async function jupiterBuyQuote(mint: string, amountUsd6: bigint, slippageBps = 100) {
  return jupiterQuote({
    inputMint: SOL_USDC,
    outputMint: mint,
    amountRaw: usdcRawFromUsd6(amountUsd6),
    slippageBps,
  });
}

export async function jupiterSellQuote(mint: string, amountRaw: bigint, slippageBps = 100) {
  return jupiterQuote({
    inputMint: mint,
    outputMint: SOL_USDC,
    amountRaw,
    slippageBps,
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
    const body = (await res.json()) as { swapTransaction?: string };
    return body.swapTransaction ?? null;
  } catch {
    return null;
  }
}

export { SOL_USDC };
