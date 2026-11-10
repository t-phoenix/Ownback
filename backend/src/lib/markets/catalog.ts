/** The tradable Markets universe: every asset with a verified Solana mint (never invented; AI_BUILD). */
import { listBuyableAssets, verifiedMint } from '../../shared/assets.js';
import { assetDisplayName } from '../asset-name.js';

export type MarketClass = 'stock' | 'index' | 'commodity';
export type MarketAsset = {
  assetId: string; name: string; ticker: string; token: string; icon?: string;
  class: MarketClass; chain: 'solana'; mint: string; decimals: number; issuer: string;
};

let memo: { at: number; list: MarketAsset[]; byId: Map<string, MarketAsset> } | null = null;
const MEMO_MS = 5 * 60_000; // the curated file only changes on promote

function build(): MarketAsset[] {
  const out: MarketAsset[] = [];
  for (const a of listBuyableAssets()) {
    const m = a.mints.find((x) => x.chain === 'solana' && x.verified);
    if (!m) continue;
    const cls: MarketClass = a.class === 'index' ? 'index' : a.class === 'commodity' ? 'commodity' : 'stock';
    out.push({
      assetId: a.assetId, name: assetDisplayName(a.assetId), ticker: m.symbol.replace(/x$/, ''), token: m.symbol,
      ...(m.icon ? { icon: m.icon } : {}), class: cls, chain: 'solana', mint: m.mint, decimals: m.decimals, issuer: m.issuer,
    });
  }
  return out;
}

export function marketAssets(): MarketAsset[] {
  if (!memo || Date.now() - memo.at > MEMO_MS) {
    const list = build();
    memo = { at: Date.now(), list, byId: new Map(list.map((x) => [x.assetId, x])) };
  }
  return memo.list;
}

/** A listed market or undefined. Resolves through verifiedMint, so anything unverified is not a market. */
export function marketAsset(assetId: string): MarketAsset | undefined {
  marketAssets();
  const hit = memo!.byId.get(assetId);
  return hit && verifiedMint(assetId, 'solana') ? hit : undefined;
}
