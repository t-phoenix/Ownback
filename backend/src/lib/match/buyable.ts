import { verifiedMint } from '../../shared/assets.js';
import { jupiterBuyQuote } from '../jupiter-price.js';

export type Buyable = {
  assetId: string;
  buyable: boolean;
  mint?: string;
  decimals?: number;
  symbol?: string;
};

const routeCache = new Map<string, { at: number; ok: boolean }>();

/** Code-only buyability gate (D30): verified mint + a live Jupiter USDC→token route for $1. Never invents mints. */
export async function checkBuyable(assetId: string): Promise<Buyable> {
  const mint = verifiedMint(assetId, 'solana');
  if (!mint) return { assetId, buyable: false };
  const hit = routeCache.get(mint.mint);
  let ok = hit && Date.now() - hit.at < 300_000 ? hit.ok : undefined;
  if (ok === undefined) {
    ok = (await jupiterBuyQuote(mint.mint, 1_000_000n)) != null;
    routeCache.set(mint.mint, { at: Date.now(), ok });
  }
  return { assetId, buyable: ok, mint: mint.mint, decimals: mint.decimals, symbol: mint.symbol };
}
