import { asUsd6, toUsd6, type Usd6 } from '../shared/money.js';

/** Q2 / docs/05: (feeUsd6 * 10_000n) / amountUsd6 <= maxFeeBps */
export function feeWithinCap(
  feeUsd6: bigint | string | number,
  amountUsd6: bigint | string | number,
  maxFeeBps: number | string,
): boolean {
  const fee = asUsd6(feeUsd6);
  const amount = asUsd6(amountUsd6);
  const cap = Number(maxFeeBps);
  if (amount <= 0n) return false;
  if (!Number.isFinite(cap) || cap < 50 || cap > 1000) throw new Error('maxFeeBps out of range');
  return (fee * 10_000n) / amount <= BigInt(cap);
}

export function feePctBps(feeUsd6: bigint | string | number, amountUsd6: bigint | string | number): number {
  const fee = asUsd6(feeUsd6);
  const amount = asUsd6(amountUsd6);
  if (amount <= 0n) return 0;
  return Number((fee * 10_000n) / amount);
}

/** BuyApproval absolute max fee (Q2). */
export function maxFeeUsd6(amountUsd6: bigint | string | number, maxFeeBps: number | string): bigint {
  return (asUsd6(amountUsd6) * BigInt(maxFeeBps)) / 10_000n;
}

export type Fees = {
  totalUsd6: Usd6;
  pctBps: number;
  capBps: number;
  overCap: boolean;
  covered: boolean;
  parts: { label: string; usd6: Usd6 }[];
};

export function buildFees(
  parts: { label: string; usd6: bigint | string | number }[],
  amountUsd6: bigint | string | number,
  capBps: number | string,
  covered: boolean,
): Fees {
  const total = parts.reduce((a, p) => a + asUsd6(p.usd6), 0n);
  const amount = asUsd6(amountUsd6);
  const cap = Number(capBps);
  const pctBps = feePctBps(total, amount);
  return {
    totalUsd6: toUsd6(total),
    pctBps,
    capBps: cap,
    overCap: !feeWithinCap(total, amount, cap),
    covered,
    parts: parts.map((p) => ({ label: p.label, usd6: toUsd6(p.usd6) })),
  };
}
