import { verifiedMint } from '../../shared/assets.js';
import { jupiterRouteOk } from '../jupiter-price.js';

export type Buyable = {
  assetId: string;
  buyable: boolean;
  mint?: string;
  decimals?: number;
  symbol?: string;
};

const routeCache = new Map<string, { at: number; ok: boolean }>();
// One probe at a time: a read resolves ~9 rows at once, and a burst trips lite-api's 429 (TSMx, SKHYx marked "not verified").
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(f: () => Promise<T>): Promise<T> => {
  const p = queue.then(f, f);
  queue = p.catch(() => {});
  return p;
};

async function routeOk(mint: string): Promise<boolean> {
  const hit = routeCache.get(mint);
  if (hit && Date.now() - hit.at < 300_000) return hit.ok;
  let ok = await serial(() => jupiterRouteOk(mint));
  if (ok === null) ok = await new Promise((r) => setTimeout(r, 1_500)).then(() => serial(() => jupiterRouteOk(mint)));
  // Only a real answer is cached; "couldn't ask" stays uncached so the next read asks again.
  if (ok !== null) routeCache.set(mint, { at: Date.now(), ok });
  return ok === true;
}

/** Code-only buyability gate (D30): verified mint + a live Jupiter USDC→token route for $1. Never invents mints. */
export async function checkBuyable(assetId: string): Promise<Buyable> {
  const mint = verifiedMint(assetId, 'solana');
  if (!mint) return { assetId, buyable: false };
  const ok = await routeOk(mint.mint);
  return { assetId, buyable: ok, mint: mint.mint, decimals: mint.decimals, symbol: mint.symbol };
}

/** Test hook. */
export function _resetRouteCache() {
  routeCache.clear();
}
