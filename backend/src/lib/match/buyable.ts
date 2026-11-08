import { verifiedMint } from '../../shared/assets.js';
import { jupiterPriceUsd6 } from '../jupiter-price.js';

export type Buyable = {
  assetId: string;
  buyable: boolean;
  mint?: string;
  decimals?: number;
  symbol?: string;
};

/** Code-only buyability gate — verified mint + live quote ≥ $1. Never invents mints. */
export async function checkBuyable(assetId: string): Promise<Buyable> {
  const mint = verifiedMint(assetId, 'solana');
  if (!mint) return { assetId, buyable: false };
  const price = await jupiterPriceUsd6(mint.mint);
  const buyable = price != null && price >= 1_000_000n;
  return {
    assetId,
    buyable,
    mint: mint.mint,
    decimals: mint.decimals,
    symbol: mint.symbol,
  };
}
