import { toUsd6, type Usd6 } from '../shared/money.js';

/** Q2 / docs/05: (feeUsd6 * 10_000n) / amountUsd6 <= maxFeeBps */
export function feeWithinCap(feeUsd6: bigint, amountUsd6: bigint, maxFeeBps: number): boolean {
  if (amountUsd6 <= 0n) return false;
  if (maxFeeBps < 50 || maxFeeBps > 1000) throw new Error('maxFeeBps out of range');
  return (feeUsd6 * 10_000n) / amountUsd6 <= BigInt(maxFeeBps);
}

export function feePctBps(feeUsd6: bigint, amountUsd6: bigint): number {
  if (amountUsd6 <= 0n) return 0;
  return Number((feeUsd6 * 10_000n) / amountUsd6);
}

/** BuyApproval absolute max fee (Q2). */
export function maxFeeUsd6(amountUsd6: bigint, maxFeeBps: number): bigint {
  return (amountUsd6 * BigInt(maxFeeBps)) / 10_000n;
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
  parts: { label: string; usd6: bigint }[],
  amountUsd6: bigint,
  capBps: number,
  covered: boolean,
): Fees {
  const total = parts.reduce((a, p) => a + p.usd6, 0n);
  const pctBps = feePctBps(total, amountUsd6);
  return {
    totalUsd6: toUsd6(total),
    pctBps,
    capBps,
    overCap: !feeWithinCap(total, amountUsd6, capBps),
    covered,
    parts: parts.map((p) => ({ label: p.label, usd6: toUsd6(p.usd6) })),
  };
}
