/**
 * What the user owns, from the chain (real mode) or from the book (MOCK_CHAIN). One source for /home and /holdings.
 * Dollars = Arc wallet USDC + Solana USDC; tokens = verified Solana mints priced by Jupiter.
 */
import { PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { getSql } from '../db/client.js';
import { USDC } from '../shared/chains.js';
import { listBuyableAssets, verifiedMint } from '../shared/assets.js';
import { assetDisplayName } from './asset-name.js';
import { mockChain } from './env.js';
import { jupiterPriceUsd6, rawToQty, valueUsd6 } from './jupiter-price.js';
import { solRpc } from './jupiter-swap.js';
import { freeByChain } from './wallet-sync.js';
import { qtyToRaw } from './qty.js';

export type Held = { assetId: string; name: string; token: string; chain: 'solana'; mint: string; decimals: number; raw: bigint; qty: string; priceUsd6: bigint; valueUsd6: bigint };
type User = { id: string; evmAddress?: string | null; solAddress?: string | null };

/** Raw balances of every token account the owner has, keyed by mint (both token programs). */
async function solBalances(owner: string): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>();
  const c = solRpc();
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    const res = await c.getParsedTokenAccountsByOwner(new PublicKey(owner), { programId });
    for (const a of res.value) {
      const info = (a.account.data as { parsed: { info: { mint: string; tokenAmount: { amount: string } } } }).parsed.info;
      out.set(info.mint, (out.get(info.mint) ?? 0n) + BigInt(info.tokenAmount.amount));
    }
  }
  return out;
}

async function bookBalances(userId: string): Promise<Map<string, bigint>> {
  const sql = getSql();
  const rows = await sql<{ asset_id: string; bought: string; sold: string }[]>`
    SELECT b.asset_id, COALESCE(SUM(b.qty), 0)::text AS bought,
      COALESCE((SELECT SUM(s.qty::numeric) FROM sells s WHERE s.user_id = ${userId}::uuid AND s.asset_id = b.asset_id AND s.status = 'done'), 0)::text AS sold
    FROM buy_entries b WHERE b.user_id = ${userId}::uuid AND b.status = 'bought' GROUP BY b.asset_id
  `;
  const out = new Map<string, bigint>();
  for (const r of rows) {
    const m = verifiedMint(r.asset_id, 'solana');
    if (!m) continue;
    const raw = (qtyToRaw(r.bought, m.decimals) ?? 0n) - (qtyToRaw(r.sold, m.decimals) ?? 0n);
    if (raw > 0n) out.set(m.mint, raw);
  }
  return out;
}

export async function portfolio(user: User) {
  const live = !mockChain() && !!user.solAddress;
  const [balances, arc] = await Promise.all([
    live ? solBalances(user.solAddress!).catch(() => null) : bookBalances(user.id),
    freeByChain(user as Parameters<typeof freeByChain>[0]),
  ]);
  const stale = balances === null;
  const bal = balances ?? new Map<string, bigint>();
  const held: Held[] = [];
  for (const a of listBuyableAssets()) {
    const m = a.mints.find((x) => x.chain === 'solana' && x.verified);
    const raw = m ? bal.get(m.mint) ?? 0n : 0n;
    if (!m || raw <= 0n) continue;
    const price = (await jupiterPriceUsd6(m.mint)) ?? 0n;
    held.push({
      assetId: a.assetId, name: assetDisplayName(a.assetId), token: m.symbol, chain: 'solana', mint: m.mint,
      decimals: m.decimals, raw, qty: rawToQty(raw, m.decimals), priceUsd6: price, valueUsd6: valueUsd6(raw, m.decimals, price),
    });
  }
  held.sort((x, y) => (y.valueUsd6 > x.valueUsd6 ? 1 : -1));
  const solUsdc = live ? bal.get(USDC.solana.value) ?? 0n : 0n;
  const owned = held.reduce((s, h) => s + h.valueUsd6, 0n);
  return { held, owned, arcUsdc: arc.total, solUsdc, dollars: arc.total + solUsdc, arriving: arc.arriving, byChain: arc.byChain, stale };
}
