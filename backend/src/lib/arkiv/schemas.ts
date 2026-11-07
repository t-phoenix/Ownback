import { defineSchema, str, u64 } from '@arkiv-network/sdk/schema';

export const Asset = defineSchema('ownback.asset.v1', {
  asset_id: str().indexed(),
  chain: str().indexed(),
  issuer: str().indexed(),
  symbol: str(),
  mint: str(),
  decimals: u64(),
  verified_from: str(),
});
