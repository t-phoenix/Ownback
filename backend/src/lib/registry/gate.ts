import { EvidenceKinds, type AssetCandidate, type MintEvidence } from './types.js';

/** Promote only when issuer + index + onchain evidence exist and decimals agree. */
export function threeSourceOk(evidence: MintEvidence[]): boolean {
  const kinds = new Set(evidence.map((e) => e.kind));
  return EvidenceKinds.every((k) => kinds.has(k));
}

export function canPromote(c: AssetCandidate): { ok: true } | { ok: false; reason: string } {
  if (c.status === 'rejected') return { ok: false, reason: 'rejected' };
  if (c.status === 'promoted') return { ok: false, reason: 'already_promoted' };
  if (!c.mint || c.mint.includes('☐')) return { ok: false, reason: 'mint_missing' };
  if (c.onchainDecimals === undefined) return { ok: false, reason: 'onchain_pending' };
  if (c.decimals !== undefined && c.decimals !== c.onchainDecimals) {
    return { ok: false, reason: `decimals_mismatch claimed=${c.decimals} onchain=${c.onchainDecimals}` };
  }
  if (!threeSourceOk(c.evidence)) {
    const have = new Set(c.evidence.map((e) => e.kind));
    const missing = EvidenceKinds.filter((k) => !have.has(k));
    return { ok: false, reason: `missing_evidence:${missing.join(',')}` };
  }
  const onchain = c.evidence.find((e) => e.kind === 'onchain');
  if (!onchain?.note.includes(String(c.onchainDecimals))) {
    return { ok: false, reason: 'onchain_evidence_stale' };
  }
  return { ok: true };
}
