# Venues ledger

Living list of **buy venues** Ownback may use. AI (match / buy-review) must re-check every quote against this ledger + live chain data. **Never invent mints.** A row is usable only when `verified = ✓` (A1: issuer + index + on-chain).

## How we pick a venue (runtime)

From [backend/keeper-and-jobs.md](../backend/keeper-and-jobs.md) + [backend/integrations.md](../backend/integrations.md):

1. Load the asset from `packages/shared/assets.ts` / Arkiv `asset` (must have a **verified** mint for that chain).
2. For each **enabled** venue that lists that mint, call `quote(asset, amountUsd6)`.
3. All-in cost = price impact + every simulated fee (Arc gas, CCTP, destination gas/rent, DEX fee) — [docs/05](05-gasless-and-fees.md).
4. Reference check (A4): pool price within **2%** of Pyth / Jupiter reference; else wait.
5. Fee check: `(feeUsd6 * 10_000) / amountUsd6 <= maxFeeBps`.
6. Pick the **cheapest all-in** route that passes (1)–(5). That venue’s CCTP `domain` is signed into `BuyApproval.items[].domain`.

```
jars → review quotes (per venue) → cheapest OK → user signs BuyApproval
     → keeper execute on Arc → CCTP → venue chain swap → user’s own wallet/ATA
```

## Adapter map (protocol)

| Venue id | Chain | CCTP domain | Quote / swap | Relay |
|---|---|---|---|---|
| `jupiter` | Solana | 5 | Jupiter Swap V2; `payer`=buy relay, dest=user ATA (D26) | `RELAY_SOL_USDC_ATA` |
| `uniswap` / `appkit` | Base | 6 | Uniswap Trading API / App Kit | `RELAY_BASE` |
| `uniswap` | Ethereum | 0 | same | EVM relay |
| `uniswap` | Arbitrum | 3 | same | EVM relay |
| `pancakeswap` (+ bridge) | BNB | n/a CCTP | Behind `VENUE_BNB`; not USDC-native (A19) | via Base relay |

## Asset × venue status

Fill mint / decimals / evidence only from issuer docs + explorer + on-chain. ☐ = not ready (AI must return `no_venue`).

| Slug | Token candidates | Venue | Mint | Decimals | Verified | AI notes / evidence | Updated |
|---|---|---|---|---|---|---|---|
| `co:apple` | AAPLx | Solana / `jupiter` | `XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp` | 8 | ✓ | Issuer https://xstocks.com/ featuredProducts; CoinGecko `apple-xstock` platforms.solana; on-chain supply decimals 8. Base/Eth ☐ | 2026-11-07 |

| `co:tsmc` | — | — | — | — | ☐ | S9 | |
| `mat:gold` | GLDx / PAXG / XAUt | Solana / Eth | — | — | ☐ | Fake PAXG/XAUt pools on Solana — ignore DEX copies | |
| `idx:sp500` | SPYx | Solana | — | — | ☐ | | |

## AI checklist for a **new** venue or mint

Before marking ✓ or enabling a quote:

- [ ] Issuer official URL lists the mint/address
- [ ] Second source (explorer label / CoinGecko platforms) agrees
- [ ] On-chain: `decimals`, mint authority / code exists; Solana: executable program or SPL mint
- [ ] Live pool depth: quote `$5` and `$50` impact &lt; 1% (docs/08)
- [ ] Fee simulation includes CCTP + destination rent/gas
- [ ] Arkiv `asset` written with `createdBy`+`ownedBy` = our writer
- [ ] Entry added to this ledger with evidence links and date

## Fee observations (smoke)

| Date | Action | Chain | Amount | Gas / fee | Notes |
|---|---|---|---|---|---|
| 2026-11-07 | Vault deploy | Arc | — | ≈ **$0.091 USDC** | See [tx-log.md](tx-log.md) |
| 2026-11-07 | Smoke deposit/allocate $0.30 | Arc | $0.30 | ≈ **$0.0084** USDC gas | test_user; jar only |
| 2026-11-07 | CCTP + Jupiter AAPLx | Arc→Sol | $0.30 | Arc gas ≈$0.0066; CCTP fee $0; relay ≈0.004 SOL; out 86184 raw AAPLx → `EbC8…` (Token-2022 ATA) | see [tx-log.md](tx-log.md) |

