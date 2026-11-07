/** Mint evidence for the A1 three-source gate. */

export const EvidenceKinds = ['issuer', 'index', 'onchain'] as const;
export type EvidenceKind = (typeof EvidenceKinds)[number];

export type MintEvidence = {
  kind: EvidenceKind;
  url: string;
  note: string;
  checkedAt: string;
};

export type AssetMintRow = {
  chain: 'solana' | 'ethereum' | 'base' | 'arbitrum';
  symbol: string;
  mint: string;
  decimals: number;
  issuer: string;
  venues: string[];
  verified: boolean;
  evidence: MintEvidence[];
};

export type CuratedAsset = {
  assetId: string;
  name: string;
  class: 'stock' | 'commodity' | 'index' | 'crypto' | 'yield';
  mints: AssetMintRow[];
};

export type CuratedFile = {
  updatedAt: string;
  assets: CuratedAsset[];
};

export type AssetCandidate = {
  id: string;
  assetId: string;
  name: string;
  class: CuratedAsset['class'];
  chain: AssetMintRow['chain'];
  symbol: string;
  mint: string;
  decimals?: number;
  issuer: string;
  venues: string[];
  evidence: MintEvidence[];
  source: 'scrape' | 'ai' | 'manual';
  status: 'proposed' | 'verified' | 'rejected' | 'promoted';
  onchainDecimals?: number;
  createdAt: string;
  updatedAt: string;
  rejectReason?: string;
};

export type CandidatesFile = {
  updatedAt: string;
  candidates: AssetCandidate[];
};
