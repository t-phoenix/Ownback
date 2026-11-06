import { investAmount, largestRemainderCents } from '../shared/money.js';
import type { AllocationRole } from '../shared/states.js';

export type SplitPct = { maker: number; behind: number; materials: number };

export type SplitAsset = {
  assetId: string;
  role: AllocationRole;
  /** Relative weight inside its role group (default 1). */
  weight?: number;
};

export type SplitRow = {
  assetId: string;
  role: AllocationRole;
  amountUsd6: bigint;
};

/**
 * Split invest amount across maker / behind / materials in whole cents (D18).
 * Empty behind/materials → share goes to maker. Untokenized maker → fallbackAsset.
 * Wireframe Confirm: $47.75 @ 70/20/10 → 33.43 / 3.18+3.18+3.19 / 2.39+2.38.
 */
export function splitInvest(opts: {
  amountUsd6: bigint;
  rateBps: number;
  split: SplitPct;
  makers: SplitAsset[];
  behind: SplitAsset[];
  materials: SplitAsset[];
  fallbackAsset: string;
  makerOnly?: boolean;
}): { investUsd6: bigint; rows: SplitRow[]; notListed: boolean } {
  const { split } = opts;
  if (split.maker + split.behind + split.materials !== 100) {
    throw new Error('split must sum to 100');
  }

  const investUsd6 = investAmount(opts.amountUsd6, opts.rateBps);

  let makers = opts.makers;
  let behind = opts.makerOnly ? [] : opts.behind;
  let materials = opts.makerOnly ? [] : opts.materials;

  // Untokenized maker → fallback as maker role
  if (makers.length === 0) {
    makers = [{ assetId: opts.fallbackAsset, role: 'fallback' }];
  }

  let makerPct = split.maker;
  let behindPct = split.behind;
  let materialsPct = split.materials;
  if (behind.length === 0) {
    makerPct += behindPct;
    behindPct = 0;
  }
  if (materials.length === 0) {
    makerPct += materialsPct;
    materialsPct = 0;
  }

  if (makers.length === 0 && behind.length === 0 && materials.length === 0) {
    return { investUsd6, rows: [], notListed: true };
  }

  // Group cents: maker half-up, behind floor of its share, materials = residual (matches Confirm $47.75).
  const totalCents = Number(investUsd6 / 10_000n);
  const makerExact = (totalCents * makerPct) / 100;
  const makerCents = Math.floor(makerExact + 0.5);
  const behindCents = Math.floor((totalCents * behindPct) / 100);
  const materialsCents = totalCents - makerCents - behindCents;
  const groupTotals = [
    BigInt(makerCents) * 10_000n,
    BigInt(behindCents) * 10_000n,
    BigInt(materialsCents) * 10_000n,
  ];

  const rows: SplitRow[] = [];
  const pushGroup = (assets: SplitAsset[], total: bigint, defaultRole: AllocationRole) => {
    if (total === 0n || assets.length === 0) return;
    // Sort by assetId so equal-weight LR ties match docs/03 Confirm (Corning / gold get the spare cent).
    const ordered = [...assets].sort((a, b) => a.assetId.localeCompare(b.assetId));
    const weights = ordered.map((a) => a.weight ?? 1);
    const parts = largestRemainderCents(total, weights);
    for (let i = 0; i < ordered.length; i++) {
      rows.push({
        assetId: ordered[i]!.assetId,
        role: ordered[i]!.role ?? defaultRole,
        amountUsd6: parts[i]!,
      });
    }
  };

  pushGroup(makers, groupTotals[0]!, 'maker');
  pushGroup(behind, groupTotals[1]!, 'supplier');
  pushGroup(materials, groupTotals[2]!, 'material');

  const sum = rows.reduce((a, r) => a + r.amountUsd6, 0n);
  if (sum !== investUsd6) throw new Error(`split sum ${sum} !== invest ${investUsd6}`);

  return { investUsd6, rows, notListed: false };
}

/** Scale selected allocation rows to a new total (partial confirm), whole cents, D18. */
export function scaleAllocations(
  rows: { assetId: string; amountUsd6: bigint }[],
  newTotalUsd6: bigint,
): { assetId: string; amountUsd6: bigint }[] {
  if (rows.length === 0) return [];
  if (newTotalUsd6 % 10_000n !== 0n) throw new Error('new total must be whole cents');
  const weights = rows.map((r) => Number(r.amountUsd6 / 10_000n));
  const parts = largestRemainderCents(newTotalUsd6, weights);
  return rows.map((r, i) => ({ assetId: r.assetId, amountUsd6: parts[i]! }));
}
