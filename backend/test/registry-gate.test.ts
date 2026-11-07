import { describe, expect, it } from 'vitest';
import { canPromote, threeSourceOk } from '../src/lib/registry/gate.js';
import type { AssetCandidate, MintEvidence } from '../src/lib/registry/types.js';

const day = '2026-11-07';

function ev(partial: Partial<MintEvidence> & Pick<MintEvidence, 'kind'>): MintEvidence {
  return {
    url: 'https://example.com',
    note: partial.kind === 'onchain' ? 'decimals=8' : 'ok',
    checkedAt: day,
    ...partial,
  };
}

function cand(over: Partial<AssetCandidate> = {}): AssetCandidate {
  return {
    id: 'c1',
    assetId: 'co:apple',
    name: 'Apple',
    class: 'stock',
    chain: 'solana',
    symbol: 'AAPLx',
    mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp',
    issuer: 'xStocks',
    venues: ['jupiter'],
    evidence: [],
    source: 'manual',
    status: 'verified',
    onchainDecimals: 8,
    createdAt: day,
    updatedAt: day,
    ...over,
  };
}

describe('three-source gate', () => {
  it('requires issuer + index + onchain', () => {
    expect(threeSourceOk([ev({ kind: 'issuer' }), ev({ kind: 'index' })])).toBe(false);
    expect(
      threeSourceOk([ev({ kind: 'issuer' }), ev({ kind: 'index' }), ev({ kind: 'onchain' })]),
    ).toBe(true);
  });

  it('blocks promote without onchain decimals or full evidence', () => {
    expect(canPromote(cand({ onchainDecimals: undefined })).ok).toBe(false);
    expect(
      canPromote(
        cand({
          evidence: [ev({ kind: 'issuer' }), ev({ kind: 'index' })],
        }),
      ).ok,
    ).toBe(false);
  });

  it('allows promote when three sources + matching decimals', () => {
    const r = canPromote(
      cand({
        evidence: [ev({ kind: 'issuer' }), ev({ kind: 'index' }), ev({ kind: 'onchain' })],
      }),
    );
    expect(r).toEqual({ ok: true });
  });

  it('rejects decimals mismatch', () => {
    const r = canPromote(
      cand({
        decimals: 6,
        onchainDecimals: 8,
        evidence: [ev({ kind: 'issuer' }), ev({ kind: 'index' }), ev({ kind: 'onchain' })],
      }),
    );
    expect(r.ok).toBe(false);
  });
});
