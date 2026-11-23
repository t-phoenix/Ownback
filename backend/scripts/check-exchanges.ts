/**
 * Live check (D47): pool index + one quote per exchange for a few tokens. No keys, no writes.
 *   cd backend && npx tsx scripts/check-exchanges.ts TSLAx AAPLon
 */
import { verifiedMint } from '../src/shared/assets.js';
import { jupiterBuyQuote, rawToQty } from '../src/lib/jupiter-price.js';
import { EXCHANGES, poolIndex, routeExchanges } from '../src/lib/markets/pools.js';

const ids: Record<string, string> = { TSLAx: 'co:tesla', AAPLx: 'co:apple', NVDAx: 'co:nvidia', AAPLon: 'tok:aaplon', TSLAon: 'tok:tslaon' };
for (const sym of process.argv.slice(2)) {
  const m = verifiedMint(ids[sym] ?? sym, 'solana');
  if (!m) { console.log(sym, 'no verified mint'); continue; }
  const idx = await poolIndex(m.mint);
  console.log(`\n${sym}: liquidity $${Number(idx?.liquidityUsd6 ?? 0n) / 1e6} · vol $${Number(idx?.volume24hUsd6 ?? 0n) / 1e6} · thin ${idx?.thin}`);
  for (const e of idx?.exchanges ?? []) console.log(`  ${e.label.padEnd(12)} pools ${e.pools} liq $${Number(e.liquidityUsd6) / 1e6} quotable ${e.quotable}`);
  for (const key of ['best', ...(idx?.exchanges ?? []).filter((e) => e.quotable).map((e) => e.key)]) {
    const q = await jupiterBuyQuote(m.mint, 25_000_000n, 100, 2, undefined, key === 'best' ? undefined : EXCHANGES[key]!.dexes);
    console.log(`  $25 on ${key.padEnd(10)} → ${q ? rawToQty(BigInt(q.outAmount), m.decimals) : 'no quote'} ${q ? routeExchanges(q.routePlan).join('+') : ''}`);
    await new Promise((r) => setTimeout(r, 1100));
  }
}
