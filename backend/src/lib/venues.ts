/**
 * D43 multi-venue: an asset can have several verified Solana tokens (xStocks, Ondo). Buys pick one per asset:
 * the token the user already holds (holdings and sells show one token per asset), else the cheapest route now.
 */
import { asUsd6 } from '../shared/money.js';
import { verifiedMints } from '../shared/assets.js';
import type { AssetMintRow } from './registry/types.js';
import { buySwapCostUsd6, jupiterBuyQuote, jupiterPriceUsd6, routeFeeUsd6, valueUsd6, type JupiterQuote } from './jupiter-price.js';
import { tokenBalanceRaw } from './jupiter-swap.js';

export type BuyVenue = { mint: AssetMintRow; quote: JupiterQuote | null; feeUsd6: bigint };

/** Measured buy cost for one token at this size (round trip, else gap to Jupiter's price). */
export async function quoteVenue(mint: AssetMintRow, spendUsd6: bigint): Promise<BuyVenue> {
  const [quote, oracle] = await Promise.all([jupiterBuyQuote(mint.mint, spendUsd6), jupiterPriceUsd6(mint.mint)]);
  const outRaw = quote ? BigInt(quote.outAmount) : 0n;
  if (outRaw <= 0n) return { mint, quote: null, feeUsd6: 0n };
  const measured = await buySwapCostUsd6(mint.mint, spendUsd6, outRaw);
  const feeUsd6 = measured ?? (oracle ? routeFeeUsd6(spendUsd6, valueUsd6(outRaw, mint.decimals, asUsd6(oracle))) : 0n);
  return { mint, quote, feeUsd6 };
}

/** Lowest cost among quoted venues; unquoted ones lose. Pure; exported for tests. */
export function cheapest(venues: BuyVenue[]): BuyVenue | undefined {
  const quoted = venues.filter((v) => v.quote);
  return quoted.sort((a, b) => (a.feeUsd6 < b.feeUsd6 ? -1 : a.feeUsd6 > b.feeUsd6 ? 1 : 0))[0] ?? venues[0];
}

/** The verified token of this asset the owner holds most of, if any (one RPC read per token). */
export async function heldMint(owner: string | null | undefined, assetId: string): Promise<AssetMintRow | undefined> {
  const mints = verifiedMints(assetId, 'solana');
  if (!owner || !mints.length) return undefined;
  const bal = await Promise.all(mints.map((m) => tokenBalanceRaw(owner, m.mint).catch(() => 0n)));
  let best = -1;
  bal.forEach((b, i) => { if (b > 0n && (best < 0 || b > bal[best]!)) best = i; });
  return best >= 0 ? mints[best] : undefined;
}

/** Venue for a buy: the held token if any, else the cheapest. undefined when the asset has no verified token. */
export async function pickBuyVenue(assetId: string, spendUsd6: bigint, owner?: string | null): Promise<BuyVenue | undefined> {
  const mints = verifiedMints(assetId, 'solana');
  if (!mints.length) return undefined;
  const held = mints.length > 1 ? await heldMint(owner, assetId) : undefined;
  if (held || mints.length === 1) return quoteVenue(held ?? mints[0]!, spendUsd6);
  return cheapest(await Promise.all(mints.map((m) => quoteVenue(m, spendUsd6))));
}

/** `buy_entries.venue` stores "jupiter:<mint>" so the submit step books the token that was actually swapped. */
export const venueTag = (mint: string) => `jupiter:${mint}`;
export const venueMint = (venue: string | null | undefined) => (venue?.startsWith('jupiter:') ? venue.slice(8) : undefined);
