import { splitInvest, type SplitPct } from '../split.js';
import type { GraphLink } from './graph.js';
import { checkBuyable } from './buyable.js';

export type MatchParty = { assetId: string; role: 'maker' | 'supplier' | 'material'; why: string };

export type JuryResult = {
  makers: MatchParty[];
  behind: MatchParty[];
  materials: MatchParty[];
  lowConfidence: boolean;
  juryNotes: string[];
  split: ReturnType<typeof splitInvest>;
};

/**
 * Presiding juror: merge makers/supply/materials, optional buyable filter for notes,
 * then splitInvest (70/20/10). Untokenized assets still get jar allocations (buy later when venue exists).
 */
export async function finalizeMatch(opts: {
  amountUsd6: bigint;
  rateBps: number;
  split: SplitPct;
  fallbackAsset: string;
  makers: MatchParty[];
  behind: GraphLink[];
  materials: GraphLink[];
  lowConfidence: boolean;
}): Promise<JuryResult> {
  const notes: string[] = [];
  const behind: MatchParty[] = opts.behind.map((b) => ({
    assetId: b.assetId,
    role: 'supplier' as const,
    why: b.why,
  }));
  const materials: MatchParty[] = opts.materials.map((m) => ({
    assetId: m.assetId,
    role: 'material' as const,
    why: m.why,
  }));

  // Deduplicate across roles (maker wins).
  const seen = new Set(opts.makers.map((m) => m.assetId));
  const behindDedup = behind.filter((b) => {
    if (seen.has(b.assetId)) return false;
    seen.add(b.assetId);
    return true;
  });
  const materialsDedup = materials.filter((m) => {
    if (seen.has(m.assetId)) return false;
    seen.add(m.assetId);
    return true;
  });

  for (const p of [...opts.makers, ...behindDedup, ...materialsDedup]) {
    const b = await checkBuyable(p.assetId);
    if (!b.buyable) notes.push(`${p.assetId}: not verified buyable yet — jar waits`);
  }

  const split = splitInvest({
    amountUsd6: opts.amountUsd6,
    rateBps: opts.rateBps,
    split: opts.split,
    makers: opts.makers.map((m) => ({ assetId: m.assetId, role: m.role === 'maker' ? 'maker' : 'fallback' })),
    behind: behindDedup.map((b) => ({ assetId: b.assetId, role: 'supplier' })),
    materials: materialsDedup.map((m) => ({ assetId: m.assetId, role: 'material' })),
    fallbackAsset: opts.fallbackAsset,
  });

  return {
    makers: opts.makers,
    behind: behindDedup,
    materials: materialsDedup,
    lowConfidence: opts.lowConfidence,
    juryNotes: notes,
    split,
  };
}
