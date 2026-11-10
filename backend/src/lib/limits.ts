import { ApiError } from '../shared/errors.js';

export type LimitCheck = {
  usedUsd6: bigint;
  capUsd6: bigint;
  leftUsd6: bigint;
};

export function remainingThisMonth(usedUsd6: bigint, capUsd6: bigint): LimitCheck {
  const left = capUsd6 > usedUsd6 ? capUsd6 - usedUsd6 : 0n;
  return { usedUsd6, capUsd6, leftUsd6: left };
}

/**
 * D40: apply the user's per-row amounts to the selected rows. Saves are reservations, so the free
 * balance never limits them. Rows not in `amounts` keep their amount; the total is the sum.
 */
export function applyAmounts(
  rows: { assetId: string; amountUsd6: bigint }[],
  amounts: { assetId: string; amountUsd6: bigint }[] = [],
): { rows: { assetId: string; amountUsd6: bigint }[]; totalUsd6: bigint } {
  const want = new Map<string, bigint>();
  for (const a of amounts) {
    if (a.amountUsd6 < 0n || a.amountUsd6 % 10_000n !== 0n || want.has(a.assetId)) {
      throw new ApiError('VALIDATION', { assetId: a.assetId, reason: 'whole_cents' });
    }
    if (!rows.some((r) => r.assetId === a.assetId)) {
      throw new ApiError('VALIDATION', { assetId: a.assetId, reason: 'not_selected' });
    }
    want.set(a.assetId, a.amountUsd6);
  }
  const out = rows.map((r) => ({ assetId: r.assetId, amountUsd6: want.get(r.assetId) ?? r.amountUsd6 }));
  const totalUsd6 = out.reduce((s, r) => s + r.amountUsd6, 0n);
  if (totalUsd6 <= 0n) throw new ApiError('NOTHING_TO_BUY');
  return { rows: out, totalUsd6 };
}

export function jarState(
  amountUsd6: bigint | string,
  readyMinUsd6: bigint | string,
): 'filling' | 'ready' {
  return BigInt(amountUsd6) >= BigInt(readyMinUsd6) ? 'ready' : 'filling';
}
