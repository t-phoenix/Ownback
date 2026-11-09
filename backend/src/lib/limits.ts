import { toUsd6 } from '../shared/money.js';
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

/** Pre-check for confirm. Partial path returns scale-to amount when over limit. */
export function precheckConfirm(opts: {
  investUsd6: bigint;
  usedUsd6: bigint;
  capUsd6: bigint;
  freeUsd6: bigint;
  partialUsd6?: bigint;
}): { ok: true; amountUsd6: bigint; restUsd6: bigint } | never {
  const limit = remainingThisMonth(opts.usedUsd6, opts.capUsd6);
  const want = opts.partialUsd6 ?? opts.investUsd6;

  if (want > opts.freeUsd6) {
    throw new ApiError('INSUFFICIENT_FREE', {
      freeUsd6: toUsd6(opts.freeUsd6),
      shortUsd6: toUsd6(want - opts.freeUsd6),
    });
  }

  if (want > limit.leftUsd6) {
    throw new ApiError('LIMIT_REACHED', {
      usedUsd6: toUsd6(limit.usedUsd6),
      capUsd6: toUsd6(limit.capUsd6),
      leftUsd6: toUsd6(limit.leftUsd6),
    });
  }

  const rest =
    opts.partialUsd6 !== undefined && opts.partialUsd6 < opts.investUsd6
      ? opts.investUsd6 - opts.partialUsd6
      : 0n;

  return { ok: true, amountUsd6: want, restUsd6: rest };
}

export function jarState(
  amountUsd6: bigint | string,
  readyMinUsd6: bigint | string,
): 'filling' | 'ready' {
  return BigInt(amountUsd6) >= BigInt(readyMinUsd6) ? 'ready' : 'filling';
}
