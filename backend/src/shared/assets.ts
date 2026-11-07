/**
 * Verified buyable assets + discovery catalog helpers.
 * Temporary until packages/shared (docs/03 O1).
 *
 * Where data lives:
 * - Buyable (production): database/registry/assets-curated.json + Arkiv ownback.asset.v1
 * - Discovery (long list): database/registry/catalog-{companies,tokens}.json
 */
import { getCatalogCompany } from '../lib/registry/catalog.js';
import { listVerifiedAssets, getVerifiedAsset as storeGet } from '../lib/registry/store.js';
import type { CuratedAsset } from '../lib/registry/types.js';

export type AssetId = string;
export type AssetDef = CuratedAsset;

export function getAsset(assetId: string): AssetDef | undefined {
  const curated = storeGet(assetId);
  if (curated) return curated;
  // Catalog-only companies are visible for Confirm labels, but have no verified mint.
  const c = getCatalogCompany(assetId);
  if (!c) return undefined;
  return {
    assetId: c.assetId,
    name: c.name,
    class: (c.class === 'etf' ? 'stock' : c.class === 'perp' ? 'stock' : c.class) as CuratedAsset['class'],
    mints: [],
  };
}

export function listBuyableAssets(): AssetDef[] {
  return listVerifiedAssets();
}

/** Keeper / review: verified mint for a chain, or undefined → no_venue. */
export function verifiedMint(assetId: string, chain: string) {
  const a = getAsset(assetId);
  const m = a?.mints.find((x) => x.chain === chain && x.verified);
  return m;
}

export function assertVerifiedMint(assetId: string, chain: string) {
  const m = verifiedMint(assetId, chain);
  if (!m) throw new Error(`no_verified_mint:${assetId}:${chain}`);
  return m;
}
