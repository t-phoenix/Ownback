import { CENT_USD6 } from './timing.js';

/** Usd6 = digit string of micro-USDC. Never a float (AI_BUILD). */
export type Usd6 = string;

export function parseUsd6(s: string): bigint {
  if (!/^\d+$/.test(s)) throw new Error(`invalid Usd6: ${s}`);
  return BigInt(s);
}

/** postgres.js returns bigint columns as strings; coerce before any arithmetic. */
export function asUsd6(n: bigint | string | number | null | undefined): bigint {
  if (n == null || n === '') return 0n;
  return typeof n === 'bigint' ? n : BigInt(n);
}

export function toUsd6(n: bigint | string | number): Usd6 {
  const v = asUsd6(n);
  if (v < 0n) throw new Error('Usd6 cannot be negative');
  return v.toString();
}

/** Display only: half-up to cents. Never use for storage math. */
export function formatUsd(usd6: Usd6 | bigint): string {
  const n = typeof usd6 === 'bigint' ? usd6 : parseUsd6(usd6);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const cents = (abs + 5_000n) / CENT_USD6; // half-up micro → cents
  const dollars = cents / 100n;
  const rem = cents % 100n;
  const body = `$${dollars}.${rem.toString().padStart(2, '0')}`;
  return neg ? `-${body}` : body;
}

/** Round half-up to a whole cent (multiple of 10_000 micro-USDC). */
export function roundToCent(usd6: bigint): bigint {
  if (usd6 < 0n) throw new Error('negative');
  const rem = usd6 % CENT_USD6;
  if (rem === 0n) return usd6;
  if (rem >= CENT_USD6 / 2n) return usd6 - rem + CENT_USD6;
  return usd6 - rem;
}

/** investUsd6 = amountUsd6 × rateBps / 10000, half-up to a whole cent (ai-spec). */
export function investAmount(amountUsd6: bigint, rateBps: number): bigint {
  if (rateBps < 200 || rateBps > 1000) throw new Error('rateBps out of range');
  const product = amountUsd6 * BigInt(rateBps);
  const micros = (product + 5_000n) / 10_000n; // half-up divide by 10_000
  return roundToCent(micros);
}

/**
 * Largest-remainder split into whole cents so parts sum exactly to totalCents*10000.
 * weights are relative (e.g. 70/20/10 or equal shares within a group).
 */
export function largestRemainderCents(totalUsd6: bigint, weights: number[]): bigint[] {
  if (totalUsd6 % CENT_USD6 !== 0n) throw new Error('total must be whole cents');
  if (weights.length === 0) return [];
  const totalCents = totalUsd6 / CENT_USD6;
  const wSum = weights.reduce((a, b) => a + b, 0);
  if (wSum <= 0) throw new Error('weights must sum > 0');

  // All bigint: weights scaled to micro-units, so no float ever touches the money.
  const W = weights.map((w) => BigInt(Math.round(w * 1_000_000)));
  const wBig = W.reduce((a, b) => a + b, 0n);
  const nums = W.map((w) => totalCents * w);
  const out = nums.map((n) => n / wBig);
  const rem = totalCents - out.reduce((a, b) => a + b, 0n);
  // Ties: lower index first (callers should sort assetIds ascending so Confirm fixtures match docs/03).
  const order = nums
    .map((n, i) => ({ i, frac: n % wBig }))
    .sort((a, b) => (b.frac > a.frac ? 1 : b.frac < a.frac ? -1 : a.i - b.i));
  for (let k = 0n; k < rem; k++) out[order[Number(k) % order.length]!.i]! += 1n;
  return out.map((c) => c * CENT_USD6);
}
