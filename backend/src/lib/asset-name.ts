import { getAsset } from '../shared/assets.js';
import { getCatalogCompany } from './registry/catalog.js';

/** Human name for an asset id: verified registry first, then the discovery catalog, never the raw id if either knows it. */
export function assetDisplayName(assetId: string): string {
  return getAsset(assetId)?.name ?? getCatalogCompany(assetId)?.name ?? assetId;
}
