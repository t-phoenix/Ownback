# Asset expansion plan: more issuers on the same Jupiter venue

Status: **proposal** (11 Nov). Nothing here is built. Open questions are O9–O10 in [docs/03](03-decisions-and-open-questions.md#still-open).

## Why TSMC and SK hynix showed "not on-chain yet" (fixed 11 Nov)

The receipt read resolves about nine jury rows at once. Each one asked Jupiter's lite API for a $1 route, all at the same moment. Jupiter answered with 429s, and some requests timed out. `jupiterQuote` turned every failure into `null`, so `checkBuyable` said "no route" and cached that for 5 minutes. The status was then saved into `purchases.analysis`, so the receipt kept it.

TSMx and SKHYx are verified in `assets-curated.json` and have live routes (checked 11 Nov: a $1 quote returns fills for both).

Fix ([buyable.ts](../backend/src/lib/match/buyable.ts), [jupiter-price.ts](../backend/src/lib/jupiter-price.ts) `jupiterRouteOk`):
- one route check at a time, so a read never bursts the API;
- "no route" (Jupiter's `NO_ROUTES_FOUND`) is told apart from "couldn't ask" (429, timeout, 5xx). Only a real answer is cached. A failed request is retried once and never cached.

**Old receipts:** open the receipt, then *Check the details* → save. That re-runs the resolver (the jury verdict comes from the cache, so it costs nothing).

**Qualcomm is a real "no".** QCOMx has `NO_ROUTES_FOUND` on Jupiter (22 holders, no pool), and Ultra/RFQ can't quote it either. No code change makes QCOMx buyable. Another issuer can.

## What Jupiter already lists (11 Nov, `tokens/v2/tag?query=verified`)

| Issuer tag | Verified stock/RWA tokens | Example with a live route |
|---|---|---|
| `xstocks` | 1,519 | TSMx ($34k liquidity) — **what we use today** (834 promoted) |
| `ondo` (Ondo Global Markets) | 481 | QCOMon (thin, ~$100), TSMon |
| `backpack` (Backpack Securities) | 92 | TSM ($61k), MU ($251k) |
| `prestocks`, `shift`, `tessera`, commodities | ~25 | not checked |

All of these are SPL / Token-2022 mints that route through the same Jupiter swap we already build. They land in the user's own Solana wallet. "Backpack" here means **Backpack Securities' on-chain tokens**, not the Backpack exchange. The exchange is custodial and breaks the "into your own wallet" rule.

Searching Jupiter for "Qualcomm" or "TSMC" returns dozens of fake pump.fun tokens. **Only the `verified` tag plus an issuer tag plus our own three-source evidence counts.** Never pick a mint from a name search.

## Plan

1. **Scrape candidates, never promote from the scrape.** Extend [scrape-xstocks.ts](../backend/src/lib/registry/scrape-xstocks.ts) into a per-issuer scraper. It reads Jupiter's verified tag list, keeps tokens tagged `stocks`/`rwa` plus `ondo` | `backpack`, and writes them to `candidates.json` with an `index` evidence row (Jupiter tag API).
2. **Add issuer evidence for each issuer.** Ondo: its official token list / docs page with Solana addresses. Backpack Securities: its official asset list. A human confirms each URL once (A1, [venues-ledger](venues-ledger.md)). The `onchain` row reads decimals and the mint program from RPC, which already exists in [onchain.ts](../backend/src/lib/registry/onchain.ts). `canPromote` stays unchanged: issuer + index + onchain.
3. **Several mints per company.** `assets-curated.json` already holds `mints[]` per asset. Add the Ondo and Backpack mints to the existing company row (`co:tsmc` gets TSMx + TSM + TSMon). Don't create new assets. Underlying ticker matching uses `symbol-map.ts`.
4. **Pick the mint at quote time, not in the catalog.** `checkBuyable` → buyable if *any* verified mint routes. `/buys/review` and Markets quote every verified mint for the actual amount and choose the cheapest all-in quote that passes the fee check (`(fee * 10_000n) / amount <= maxFeeBps`). Thin Ondo pools fail that check on their own. The chosen `mint` is already stored per buy entry. Sells must use the mint you hold.
5. **Holdings and prices.** Positions are keyed by mint already (wallet sync). Group them per company in Holdings ("TSMC · 2 tokens"). The price worker batches all mints in one `price/v3` call.
6. **UI copy.** The Confirm screen shows the issuer next to the token (`TSM · Backpack`). The "not on-chain yet" badge keeps its three states. Add a fourth, "No market right now", for a verified token with no route (QCOMx today), so it's honest instead of "not verified".
7. **Tests.** Scraper rejects untagged/unverified tokens; multi-mint `checkBuyable`; cheapest-mint pick with a fee-cap reject; sell uses the held mint.

Expected effect: Qualcomm (via QCOMon, if the fee check passes at the amount), plus about 90 Backpack names with deeper pools than their xStock twins (TSM, MU).

## Not doing

- Backpack exchange API / any custodial venue (breaks D29: user's own wallet, user signs).
- Name-search mints, pump.fun tokens, anything without the `verified` tag.
- EVM issuers (Ondo on Ethereum, xStocks on Base): the Base/EVM venue is still behind a flag.
