# 03 · Decisions and open questions

The order of truth is **wireframes, then PRD, then architecture** (set by the user on 6 Nov). The user's answers recorded here override all three. Wireframe numbers are **examples**: the logic below decides real values.

## Decided on 6 Nov (user's answers to Q1–Q7) · updated later same day

### Q1 · Ready minimum (not a per-company max) ✅ · revised 6 Nov evening

**Earlier mistake:** docs treated "max per company" as a hard monthly % of the limit (e.g. 20% of $50 = $10), which would force Apple's $33.43 on the iPhone Confirm into an overflow to S&P 500 and make the vault revert. That is **not** the product.

**Rule now (user, 6 Nov evening):**
- There is **no per-company max**. A single asset may receive any share of a purchase (e.g. Apple $33.43 of $47.75). The wireframe Confirm numbers stand.
- There **is** a **ready minimum** (`readyMinUsd6`, default **$5**). Purpose: avoid prompting buys so small that **fees can eat the investment**. It is a **threshold for "Ready · tap to buy"**, not a ceiling. Jars and buys **may be larger**.
- Jars below the ready minimum stay *filling*. The user can still **"Buy now anyway"**; the fee check (Q2) blocks only when fees exceed `maxFeeBps`.
- ~~The only hard spend ceiling is the monthly limit.~~ Removed by **D32**: no spend cap at all; only the free balance limits a save.
- Vault `Rules` store `rateBps`, `monthlyCap`, `fallbackAsset` only. **No `maxPerAssetBps`. No `OverAssetCap`.** Match does not invent overflow rows.

### Q2 · Fees: always shown, simulated first, capped by the user ✅

- **Fee limit:** `maxFeeBps`, default **500 (5%) of the amount being invested or moved**. Settings → Investing → "Max fees". Range 0.5–10%.
- **Check (integer math, micro-USDC):** `(feeUsd6 * 10_000n) / amountUsd6 <= maxFeeBps`. Never compare a 0–1 ratio to bps.
- **BuyApproval field:** `maxFeeUsd6 = (amountUsd6 * maxFeeBps) / 10_000n` (absolute micro-USDC). The vault/keeper honour that absolute; the app shows both $ and %.
- **Simulate before every money move** (EVM simulate + gas, Solana simulate, CCTP/Gateway/forwarder quotes, venue quotes, new ATA rent).
- **Show** fees in $ and % on every review/approval; Done / Holding / Receipt show fees actually paid.
- **Enforce:** automatic steps over the limit wait (`fees_high`); user actions over the limit are blocked ("Change fee limit"); never silently sent.
- Mid-route fee spike → stop, return money to the jar; we pay the return.
- Buy fees come from the amount bought. Arc deposits / Confirm / withdraws: user pays fractions of a cent in USDC (no Gas Station; Q9). Show "< $0.01".
- Full table: [05-gasless-and-fees.md](05-gasless-and-fees.md).

### Q3 · How money on other chains gets to the vault ✅ · confirmed 6 Nov

**Problem:** USDC on Base/Eth/Arb sits in the user's wallet; only their key can move it. Google users need a wallet approval (app open) unless they pre-approve a forwarder.

**Confirmed plan:**

| Path | Who | Taps | How |
|---|---|---|---|
| **1 · Deposit on Arc** (Fund screen **default**) | Everyone | 0 extra | Lands where the vault is. Used at next Confirm via `depositAndAllocate`, or added straight away |
| **2 · Auto-add on Base / Ethereum / Arbitrum** | Everyone (flagged) | **1, once per chain** | User approves `OwnbackDepositForwarder` up to a spending allowance they pick (default $1,000). Relayer moves USDC via CCTP V2 fast into **their** vault balance with the app closed. Forwarder can't send elsewhere; its fee ≤ 0.1%. **MVP (D27):** off for Google until a gas sponsor spike passes — Fund defaults to Arc |
| **3 · One tap when it lands** | Solana, or anyone who skips auto-add | 1 per deposit | Push "$20.00 arrived · tap to add it". Google on Solana: Privy Solana wallet → SPL to our deposit account (Kora/deposit-relay fee payer) → CCTP → vault (A15) |

Wireframe copy: Fund defaults to Arc; "Auto-add from {chain}" row (hidden while D27 flag off); Deposit step 3 = "Moved to your vault on Arc · CCTP". Gateway out — CCTP direct only (Q9).

Google approvals use **Privy** (Q9), not Circle's sheet.

### Q4 · Keeper: fixed relay per venue + batched execute ✅

Shares land only in the user's own address.

### Q5 · Multi-chain venues, including BNB Chain ✅

Best all-in cost within the user's fee limit. Venue adapters as before (Solana MVP must; Base should; Eth/Arb/BNB behind flags). Jars per asset; venue chosen at buy time and signed in BuyApproval.

### Q6 · Brand: Logo C · Ledger Green · Bricolage + Source Sans ✅

See [frontend/design-tokens.md](../frontend/design-tokens.md).

### Q7 · Every buy needs the user's OK; buying below the ready minimum is allowed ✅

- Ready jars (≥ `readyMinUsd6`, default $5) never buy alone. Sunday 10:00 IST (buy day) = **reminder** push only.
- Filling jars (< ready minimum) → "Buy now anyway" with fee preview; Q2 still applies.
- Limit screen "Save $X now, rest next month" → on the 1st, `rest_ready` push → one Approve.

Copy: "Ready · tap to buy"; "We'll remind you on Sunday when jars are ready"; BuyStates "Ready, waiting for you"; title "Buy done" (any day).

### Q8 · Wireframes + copy updated to match Q1–Q3, Q7 ✅ · done 6 Nov evening

Applied in [ownback-wireframes.html](../ownback-wireframes.html), the editable canvas (v25, synced from the same board files) and [frontend/copy-and-errors.md](../frontend/copy-and-errors.md). Gaps found in the first pass were fixed in the AI-readiness audit ([11](11-ai-readiness-audit.md)).

### Q9 · Wallets: Privy + CCTP; Arc stays · decided 6 Nov night · O3 closed same night

**Blocker:** Circle Developer Console account verification failed (card decline) → no Circle user-controlled wallets, Gas Station, Gateway, or developer-controlled wallet APIs for this build.

**Confirmed plan (user):**

| Keep | Drop / defer | Replace with |
|---|---|---|
| **Arc mainnet** vault + USDC (bounty / Studio) | Circle user + developer wallets, Gas Station, Gateway, App Kit | — |
| **CCTP V2** for cross-chain USDC (Q3 paths) | Circle Console as the only way to call CCTP | Direct TokenMessenger + Iris attestation from our keeper/relays |
| Google sign-in UX | Circle Web SDK challenges | **Privy** Google login |
| Seed-phrase path | — | Unchanged (device signing) |

**O3 closed (user):**
- Google EVM wallet = **Privy smart wallet** (ERC-4337 / ERC-1271; vault already verifies via `SignatureChecker`).
- Google Solana wallet = **Privy Solana** (same login). Store `evmAddress` + `solAddress` like today.
- **Solana venue buys (D26):** user never needs SOL. Relay pays `receiveMessage` + Jupiter gas/ATA rent; fees from the buy amount ≤ `maxFeeUsd6`. Never airdrop SOL to Privy Solana wallets for buys.
- **EVM auto-add (D27):** Fund defaults to Arc. Base/Eth/Arb auto-add flagged off for Google until a gas-sponsor spike (Privy sponsorship or our paymaster) passes.

Rules that follow:
- **D1 revised:** Privy is the Google wallet stack for this build. Circle Console products are optional if verification later succeeds; they are not required to ship.
- **Signing:** Google users get the same `SignableAction` shapes as seed (`evm_calls` / `typed_data` / `sol_tx`), executed through Privy. `circle_challenge` is legacy / unused.
- **Keeper / relays:** plain funded EOAs (`KEEPER_*`, `RELAYER_*`, Solana relay keys) — not Circle developer-controlled wallets.
- **Gas on Arc:** leave **$0.10 USDC buffer** in the wallet for Google *and* seed (Arc gas is USDC). No Gas Station.
- **Do not** make Chainlink CCIP the primary bridge. CCTP remains Q3. CCIP only if a CCTP Arc spike fails.
- **Prizes:** Arc Studio + vault on Arc + USDC + CCTP still target the Arc bounty. README partner-tech = Arc + CCTP + Privy (no Circle Wallets / Gas Station / Gateway unless Console opens later).
- Code after docs: spike S-Privy → auth → SignableAction runner → EOA keeper (separate PR). Env: `PRIVY_*` / `NEXT_PUBLIC_PRIVY_*`; Circle wallet envs optional; `GOOGLE_*` kept for Gmail OAuth.

## Still open

| # | Question | Status |
|---|---|---|
| O1 | **Code layout vs folder-scoped build.** README / `database/schema.md` / `backend/README.md` place runnable API + Drizzle under `apps/web` (and shared facts under `packages/shared`, D7). A 6 Nov backend+db build task constrained edits to `backend/` and `database/` only (no `apps/web`, no inventing cross-package glue). Interim: schema SQL + seed live under `database/`; API + temporary shared modules under `backend/src/`. When `apps/web` and `packages/shared` are scaffolded, move these without changing the freeze contracts. | Open — does not change product meaning |
| O2 | **Dev seed beyond wireframe fixtures.** `database/schema.md` asks `pnpm db:seed` for demo user Abhi with 23 receipts / $9,210 / 11 assets / Croma iPhone / 8 Nov + 1 Nov Apple buys. Docs/03 only freezes the multi-chain balance totals and the Confirm split for one purchase. Seed ships those frozen numbers + the Croma Confirm allocations; the other ~22 receipt rows are not invented until a fixture list is decided. | Open — seed incomplete by design |
| O3 | **Privy wallet shape.** | **Closed** — smart wallet + Privy Solana (Q9) |
| O4 | **Smart wallet not enabled in the PWA yet (7 Nov).** The PWA uses Privy Google login and creates embedded EVM + Solana wallets on login; the API stores those addresses. Q9's smart wallet needs `SmartWalletsProvider` plus smart-wallet config for Arc in the Privy dashboard. Until then the EVM address is the embedded EOA. | Open — needs Privy dashboard + Arc support check |
| O5 | **Seed-phrase sign-in UI not built (7 Nov).** `POST /api/auth/seed` now verifies the EVM and Solana signatures over the nonce (it used to accept any non-empty signature under MOCK_CHAIN). `/signin/seed` (create/import, reveal, PIN) isn't built, so Sign in hides "Use a seed phrase" until it is. | Open — screen to build |
| O6 | **Money moves are still MOCK_CHAIN (7 Nov).** Confirm returns a no-op vault call, and `/buys/review` has no venue prices; `/buys` doesn't verify EIP-712 yet. The PWA never broadcasts a call with empty calldata and submits without a tx hash, which the API accepts only under MOCK_CHAIN. Before mainnet: real `deposit`/`setRules` calldata, Jupiter quotes, EIP-712 + ERC-1271 verify (S20), then MOCK_CHAIN=0. | Open — blocks real money |
| O7 | **Solana identity vs ATA on the vault (7 Nov).** | **Closed → D28** |
| — | Spikes S1–S20 + **S-Privy**; Circle wallet spikes (S4, S6, S7, S12, S20) use Privy/EOA fallbacks from Q9 | ([08](08-build-plan-and-checklists.md)) |

## Decisions (settled)

| # | Decision | Why / source |
|---|---|---|
| D1 | **Revised (Q9):** Privy Google = smart wallet (EVM) + Solana wallet. Circle Console wallets / Gas Station / Gateway optional if verification works later. Arc + CCTP V2 stay. | User, 6 Nov night; Circle Console blocked |
| D2 | Truth order: user's decisions > wireframes > PRD > architecture | User |
| D3 | Partner prizes: Arc (Best DeFi / Onchain Finance, Arc Studio), 0G, Arkiv (from scratch) | PRD |
| D4 | Mainnet for all money; Arkiv testnet (Rabdi) is fine because it holds no money | PRD |
| D5 | Dollars everywhere; local currency only on the receipt line; rate saved; micro-USDC integers | Wireframes, PRD |
| D6 | Users hold only USDC; fees in $ and limited by `maxFeeBps` (Q2) | User |
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
| D18 | Amounts are stored as micro-USDC, but `investUsd6` and every split row are **whole cents** (multiples of 10_000), using largest-remainder rounding so rows sum exactly to `investUsd6` and what's shown equals what's stored. No per-asset overflow | Q1 revised; clarified in the AI-readiness audit |
| D19 | "Free to use" = vault free + USDC in the user's Arc wallet; other chains show "arriving" until moved | Wireframes + Q3 |
| D20 | Arkiv reads require `createdBy` + `ownedBy` = our writer; mints need two matching sources | A1 |
| D21 | Arkiv SDK **1.0.1** (schema API, `ExpirationTime`, max about 182 days) | Verified 6 Nov |
| D22 | Deposit paths: Arc default; EVM auto-add forwarder (flagged MVP); Solana one-tap | Q3 + D27 |
| D23 | Ready minimum (`readyMinUsd6`, default $5) is a reminder threshold only; not a max investment | Q1 revised |
| D24 | No `maxPerAssetBps` / `OverAssetCap` / Confirm `capOverflow` | Q1 revised |
| D25 | Stack for this build: Privy (Google wallets) + Arc vault + CCTP V2 direct + EOA keeper/relays. No CCIP as primary bridge. Circle Console optional later | Q9 |
| D26 | Solana venue buys: relay pays gas/rent (`payer` = relay, destination = **ATA of the user's Privy `solAddress` for that mint** — derived at swap time, not stored on the vault); fees from buy amount; never fund user SOL for buys | Q9 / O3 |
| D27 | Google Fund default = Arc; EVM auto-add off until gas-sponsor spike passes | Q9 / O3 |
| D29 | **User-funded buys (user, 9 Nov).** A buy moves the user's own Arc USDC: the user signs `usdc.approve(vault)` → `vault.deposit` → `vault.withdrawCrossChain(amount, 5, 0)` (plus `setSolanaRecipient` the first time). The vault forces the CCTP recipient to the user's own Solana USDC ATA. The relay calls Solana `receiveMessage` (pays SOL), then the user signs one Jupiter swap per asset with the relay as fee payer (relay co-signs, never holds the tokens). Tokens land in the user's Solana wallet. If Solana USDC already covers the buy, the Arc step is skipped. The keeper `execute`/BuyApproval path stays in the contract but is unused. Jars are DB reservations; saving a purchase into jars moves no money. Buy amounts are free (min $0.10, whole cents); the jar amount is only a suggestion. The server books the real fill from the swap tx's token balances, never the quote | User 9 Nov · supersedes the keeper path in D25/D26 for buys |
| D31 | **Sells (user, 9 Nov).** Selling swaps a verified token → USDC on Jupiter, user-signed, relay pays SOL; USDC lands in the user's Solana wallet. "Move to Arc" is a separate user-signed Solana CCTP burn to the user's Arc address; the keeper mints it on Arc | User 9 Nov |
| D28 | **Solana identity = Privy/seed `solAddress`.** Vault `solanaRecipient` + DB `sol_usdc_ata` store that wallet's **derived USDC ATA** only (CCTP mintRecipient must be a token account; Arc cannot derive Solana PDAs). Server/PWA derive from `solAddress` + USDC mint + Tokenkeg (A6). Per-asset RWA ATAs are derived at Jupiter time (mint + token program, incl. Token-2022) and never stored on the vault. Product UI shows the Solana wallet, not ATAs. | O7-A, user 7 Nov |
| D30 | **AI jury on 0G (analysis v2).** Reads run after `POST /purchases` returns (status `reading`, real `steps`). Per product: one *understand* call → 3 independent private 0G jurors (distinct healthy TeeML models; same model with 3 personas if fewer are healthy) each name 1 parent, 5 enablers, 3 commodities with a 1–2 line why → a 0G judge merges them; code counts agreement. A deterministic resolver maps names/tickers to the catalog: `buyable` (verified mint in assets-curated.json + live Jupiter route), `tokenized_unverified`, `not_onchain`, `private`. Money goes only to buyable rows (70/20/10; an empty role rolls into the parent, then the fallback). No buyable row → `not_listed`. Results cached per normalised product key in `product_analyses`. Missing or unsure fields → `needs_details` form instead of failing | User, 9 Nov (0G prize: 0G models only) |
| D32 | **Jar capacity replaces the monthly limit (user, 10 Nov).** There is no monthly limit and no spend cap. The one helper is **jar capacity** (`readyMinUsd6`, $1–$50, default $5): a jar at capacity shows *Ready to buy*, so users can let jars grow and buy in fewer, larger buys. It never blocks: the user can buy any jar at any amount (min $0.10). Only the free balance limits a save. `monthly_cap_usd6` / vault `monthlyCap` stay in storage, unused (jars are DB reservations since D29) | User 10 Nov · supersedes D13 and the monthly-cap part of Q1 |
| D33 | **One approval for the Arc buy steps (user, 10 Nov).** Arc has no batching for the embedded EOA and the vault has no deposit-and-bridge call, so the D29 steps stay separate txs. The PWA lists them on one Ownback sheet (what each does), the user approves once, then the wallet signs them in order without a popup per step (Privy `showWalletUIs: false`), with live status. Before signing headless the PWA decodes the calls and refuses anything but setSolanaRecipient / approve(vault, deposit) / deposit / withdrawCrossChain(…, 5, …) to one vault (`frontend/lib/arc-guard.ts`). Solana swap signatures are headless too. Other Arc actions keep the wallet popup | User 10 Nov · refines D29 |

## Wireframe demo data

Fixtures must agree across screens:

| Chain | Amount |
|---|---|
| Solana | $175.10 |
| Arc | $50.00 |
| Base | $5.20 |
| Ethereum | $3.90 |
| **Total** | **$234.20** across **4 chains** |

Confirm example (unchanged): invest **$47.75** → Apple **$33.43** · TSMC **$3.18** · Qualcomm **$3.18** · Corning **$3.19** · Gold **$2.39** · Silver **$2.38** (sums exact).
