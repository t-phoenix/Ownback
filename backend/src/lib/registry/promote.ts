import { ApiError } from '../../shared/errors.js';
import { canPromote } from './gate.js';
import { getCandidate, loadCurated, saveCurated, updateCandidate } from './store.js';
import type { AssetCandidate, AssetMintRow, CuratedAsset } from './types.js';
import { writeAssetToArkiv } from '../arkiv/write-asset.js';

export async function promoteCandidate(id: string): Promise<{
  candidate: AssetCandidate;
  asset: CuratedAsset;
  arkiv?: { entityKey?: string; txHash?: string; skipped?: string };
}> {
  const c = getCandidate(id);
  if (!c) throw new ApiError('NOT_FOUND');
  const gate = canPromote(c);
  if (!gate.ok) throw new ApiError('VALIDATION', { reason: gate.reason });


  const mintRow: AssetMintRow = {
    chain: c.chain,
    symbol: c.symbol,
    mint: c.mint,
    decimals: c.onchainDecimals!,
    issuer: c.issuer,
    venues: c.venues,
    verified: true,
    evidence: c.evidence,
  };

  const file = loadCurated();
  let asset = file.assets.find((a) => a.assetId === c.assetId);
  if (!asset) {
    asset = { assetId: c.assetId, name: c.name, class: c.class, mints: [] };
    file.assets.push(asset);
  }
  const mi = asset.mints.findIndex((m) => m.chain === c.chain);
  if (mi >= 0) asset.mints[mi] = mintRow;
  else asset.mints.push(mintRow);
  asset.name = c.name;
  asset.class = c.class;
  saveCurated(file);

  const kinds = [...new Set(c.evidence.map((e) => e.kind))].sort().join('+');
  const arkiv = await writeAssetToArkiv({
    assetId: c.assetId,
    chain: c.chain,
    issuer: c.issuer,
    symbol: c.symbol,
    mint: c.mint,
    decimals: c.onchainDecimals!,
    verifiedFrom: `${c.issuer}:${kinds}:${c.evidence[0]?.checkedAt ?? ''}`.slice(0, 120),
  });

  const promoted = updateCandidate(id, { status: 'promoted' })!;
  return { candidate: promoted, asset, arkiv };
}
