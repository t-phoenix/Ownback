# 03 · Decisions and open questions

The order of truth is **wireframes, then PRD, then architecture** (set by the user on 6 Nov). The user's answers recorded here override all three. Wireframe numbers are **examples**: the logic below decides real values.

## Decided on 6 Nov (user's answers to Q1–Q7)

### Q1 · Max per company = a % of the monthly limit ✅

**The exact issue was:** with the defaults ($50 monthly limit, 20% max per company), one company can take at most **$10 a month**. But the default split gives the maker 70% of every purchase. Any purchase whose invest amount is over $14.29 gives the maker more than $10, so the vault would **revert the Confirm**. The wireframe's iPhone ($33.43 to Apple) is one such case.

**Rule now:**
- The cap is `monthlyCap × maxPerAssetBps`, per asset per UTC month.
- The **match step caps each asset at what it has left this month and sends the overflow to the user's fallback** (S&P 500 by default). Confirm shows it, e.g. "Apple: $10.00 (your 20% monthly cap) · $23.43 → S&P 500".
- The fallback asset is exempt from the per-asset cap.
- The vault enforces the same rule as a backstop, so a direct contract call can't bypass it.
- If even the fallback can't take it (the monthly limit itself is reached), the Limit screen opens.

### Q2 · Fees: always shown, simulated first, capped by the user ✅

- **The cap:** a new rule, `maxFeeBps`, default **500 (5%) of the amount being invested or moved**. It's set in Settings → Investing → "Max fees". Range 0.5–10%.
- **Simulate before every money move:**
  - EVM: `simulateContract` + gas estimate
  - Solana: `simulateTransaction`
  - CCTP / Gateway / forwarder fee quotes
  - Jupiter / Uniswap quote with route fees
  - new token account rent
- **Show:** every review and approval screen lists the fees in $ and as a % of the amount, and shows the user's cap. Done, Holding and Receipt detail show the fees actually paid.
- **Enforce:**
  - Automatic steps whose estimated fee exceeds the cap don't run. The jar waits, with "Fees are high right now (7.2% · your limit 5%)".
  - User actions above the cap are blocked with "Change fee limit". They're never silently sent.
  - The cap is part of the signed BuyApproval.
- **Reverse:** a confirmed transaction can't be undone. Instead:
  - The whole route is simulated before the first irreversible step.
  - If a later step's fresh simulation exceeds the cap (e.g. Solana fees spike after the bridge), the pipeline stops and the money goes **back to the jar**. We pay for that return ("No fee charged", BuyStates 5).
- **Who pays what:**
  - Buy fees come from the amount bought, so the user sees exactly "bought $X, fees $Y".
  - Deposits, Confirm and withdrawals on Arc are sponsored where Gas Station allows, and shown as "$0.00 · we cover it".
- Full table: [05-gasless-and-fees.md](05-gasless-and-fees.md).

### Q3 · How money on other chains gets to the vault (recommended plan, please confirm) 🟡

**The problem in plain words:** when USDC lands in the user's Base address, it's in the user's own wallet. Only the user's key can move it. For Google users that key is with Circle and only signs when the user taps Approve in Circle's sheet, which needs the app open. So "you can close the app, we'll add it" can't be true with a plain deposit.

**Plan:**

| Path | Who | Taps | How |
|---|---|---|---|
| **1 · Deposit on Arc** (Fund screen default) | Everyone | 0 extra | Lands where the vault is. Used at the next Confirm via `depositAndAllocate`, or added straight away |
| **2 · Auto-add on Base / Ethereum / Arbitrum** | Everyone | **1, once per chain** | The user approves an `OwnbackDepositForwarder` up to a cap they pick (default $1,000). After that, any USDC that lands is moved by our relayer through CCTP V2 (fast transfer) into **their own** vault balance, even with the app closed. The forwarder can't send anywhere else, and its fee is capped at 0.1% |
| **3 · One tap when it lands** | Solana deposits, or anyone who skips auto-add | 1 per deposit | Push "$20.00 arrived · tap to add it". Google users on Solana: an SPL transfer to our deposit account → CCTP to the vault (A15) |

Small wireframe copy changes:
- Deposit on its way, step 3 becomes "Moved to your vault on Arc · Circle CCTP".
- Add funds gets an "Auto-add from Base · on" row.

Gateway stays optional (spike S5). Security analysis: [10-security-audit.md A14/A15](10-security-audit.md).

### Q4 · Keeper: fixed relay per venue + batched execute ✅

Shares still land only in the user's own address. The PRD's Vault and Keeper sections are updated to match.

### Q5 · Multi-chain venues, including BNB Chain ✅

We buy each asset on whichever supported chain gives the **best all-in cost** (price + price impact + every fee), within the user's fee cap. Venue adapters:

| Venue | Assets (examples) | Reached from Arc by | Phase |
|---|---|---|---|
| Solana · Jupiter | xStocks (AAPLx, SPYx, QQQx, GLDx…), Ondo | CCTP V2 (domain 5) | MVP **must** |
| Base · App Kit Swap / Uniswap / Aerodrome | Coinbase stocks (AAPLc…), Corning | CCTP V2 (6) | MVP **should** |
| Ethereum · Uniswap / Curve | Ondo, SLVon (silver), PAXG, XAUt | CCTP V2 (0) | Flag `VENUE_ETHEREUM` |
| Arbitrum · Uniswap | xStocks, Ondo | CCTP V2 (3) | Flag `VENUE_ARBITRUM` |
| **BNB Chain · PancakeSwap** | bStocks, Ondo, others with large RWA liquidity | **No CCTP.** Arc → CCTP → Base/Arbitrum → audited third-party bridge → BNB stable → swap | Flag `VENUE_BNB`, capped (A19) |

Jars stay per asset. The venue is picked at buy time, and the user sees and signs it in the BuyApproval. A jar whose asset has no live venue shows "Buys when available".

### Q6 · Brand: Logo C · Slice, Palette 2 · Ledger Green, Type II · Bricolage + Source Sans ✅

See [frontend/design-tokens.md](../frontend/design-tokens.md).

### Q7 · Every buy needs the user's OK; buying below $5 is allowed ✅

- **Ready jars (≥ $5)** don't buy by themselves. On Sunday 10:00 (the user's buy day), a push says "3 jars ready · review and buy". Buy review → **Buy now** = the user signs a BuyApproval. The keeper executes only what was signed.
- **Filling jars (< $5)** can be bought any time with "Buy now anyway". The fee preview is shown, and the fee cap still applies, so tiny buys with big fees are blocked.
- **"Save $5.00 now, rest next month"** (Limit screen): on the 1st, "Ready to save $42.75 from Croma · Approve". One tap.

Wireframe copy that changes:

| Board | Old | New |
|---|---|---|
| Jars | "Ready · buys Sun 10:00" | "Ready · tap to buy" |
| Jars | "Ready jars buy every Sunday" | "We'll remind you on Sunday when jars are ready" |
| BuyStates 1 | Scheduled | Ready, waiting for you |
| Sunday buy done | — | "Buy done" (any day) |

## Still open

| # | Question | Recommendation |
|---|---|---|
| Q3 | Confirm the deposit plan above (Arc default + one-time auto-add on EVM + one tap on Solana) | Yes |
| Q8 | Should the wireframes be updated now with the copy changes from Q3 and Q7, the fee rows (Q2), the per-company cap note (Q1), and the "Max fees" setting? | Yes, before frontend work starts |

## Decisions (settled)

| # | Decision | Why / source |
|---|---|---|
| D1 | Circle stack for sign-in and wallets. Privy is the fallback for sign-in only | User |
| D2 | Truth order: user's decisions > wireframes > PRD > architecture | User |
| D3 | Partner prizes: Arc (Best DeFi / Onchain Finance, Arc Studio), 0G, Arkiv (from scratch) | PRD |
| D4 | Mainnet for all money; Arkiv testnet (Rabdi) is fine because it holds no money | PRD |
| D5 | Dollars everywhere; local currency only on the receipt line; rate saved; micro-USDC integers | Wireframes, PRD |
| D6 | Users hold only USDC; fees in $ and capped (Q2) | User |
| D7 | Shared facts live as code in `packages/shared` | Architecture |
| D8 | Share link is `/r/[code]`; share cards use a random share ID (A13) | Wireframe + audit |
| D9 | A failed buy puts the money back in its jar; we pay the return | Wireframe BuyStates 5 |
| D10 | Partly bought: execute only what the quote supports; the rest stays in the jar | Wireframe BuyStates 4 |
| D11 | Withdraw only to the user's own address on any supported chain. EVM = `msg.sender`; Solana = recipient set by the user (48 h to change) | Wireframe + PRD + A6 |
| D12 | Buy day Sunday 10:00 IST is a **reminder**, not an automatic buy | Q7 |
| D13 | Monthly limits reset at the start of the UTC month | Simplest on-chain |
| D14 | "Type it" goes to the Fix the match screen | Wireframe |
| D15 | One Next.js app; Vercel Pro (S13) | Limits |
| D16 | Seed sign-in signs with both the EVM and Solana keys | Security |
| D17 | Jars per asset; asset ID = `keccak256(slug)`; the venue is chosen at buy time | Q5 |
| D18 | Splits in cents with largest-remainder rounding; per-asset cap overflow → fallback | Q1 |
| D19 | "Free to use" = vault free + USDC in the user's Arc wallet; other chains show "arriving" until moved | Wireframes + Q3 |
| D20 | Arkiv reads require `createdBy` + `ownedBy` = our writer; mints need two matching sources | A1 |
| D21 | Arkiv SDK **1.0.1** (schema API, `ExpirationTime`, max about 182 days) | Verified 6 Nov |

## Wireframe demo data

Wireframe numbers are examples (user, 6 Nov). Fixtures should still agree across screens. Use the corrected chain totals: Solana $175.10 · Arc $50.00 · Base $5.20 · Ethereum $3.90 = $234.20 across 4 chains.
