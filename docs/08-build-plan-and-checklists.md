# 08 · Build plan and checklists

Times are taken from the PRD's 36-hour plan. If we're behind, keep the **order**, not the times. Owners: **C** = contracts, **B** = backend, **F** = frontend, **All**. Put names next to the letters once the team is set.

## Accounts and secrets

Do these first: most spikes are blocked without them. Each secret goes into Vercel env (`demo` and `local`) and its name into `.env.example`.

| ✓ | Account / setup | Owner | Produces (env names) | Notes |
|---|---|---|---|---|
| ☐ | Circle Developer Console: project, API key, entity secret registered | B | `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET` | Save the entity secret recovery file offline |
| ☐ | Circle user-controlled wallets app + Google social login configured | B | `CIRCLE_APP_ID`, `NEXT_PUBLIC_CIRCLE_APP_ID` | Needs the Google OAuth client ID below |
| ☐ | Circle developer-controlled wallet set: keeper on Arc (+ Base, Ethereum relays if Q5 B) | B | `KEEPER_WALLET_ID`, `KEEPER_ADDRESS` | |
| ☐ | Gas Station policies: Arc, Base, Ethereum, Arbitrum, Solana; allowlist + caps from [05](05-gasless-and-fees.md) | B | — | Fund about $10 |
| ☐ | Arc Studio project created (the vault starts here) | C | `ARC_STUDIO_URL` (for the README) | Required for the Arc prize |
| ☐ | Google Cloud: OAuth client (web), consent screen **published** or demo/judge accounts as test users; `gmail.readonly` scope added | B | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Restricted scope: at most 100 test users |
| ☐ | 0G Private Computer account + credits | B | `OG_API_KEY` | Ask at the booth about "sign in with 0G" (bonus) |
| ☐ | Arkiv: access key (hub.arkiv.network/access-keys) + writer wallet with tGLM (hub.arkiv.network/faucet) | B | `ARKIV_ACCESS_KEY`, `ARKIV_WRITER_KEY`, `ARKIV_WRITER_ADDRESS` | SDK 1.0.1, Rabdi. The address goes in the README (prize rule) |
| ☐ | Circle dev wallets as relayer on Ethereum, Base, Arbitrum (forwarder calls) and as the Base relay | B | `RELAYER_WALLET_IDS` | Gas Station policy for them |
| ☐ | Solana deposit relay keypair (A15) | B | `DEPOSIT_RELAY_SOL_KEY` | Separate from the buy relay |
| ☐ | 2FA on Vercel, GitHub, Circle, Google Cloud, Neon, domain registrar (A20) | All | — | Before any deploy |
| ☐ | Solana relay keypair, about $0.10 SOL | B | `RELAY_SOL_KEY`, `RELAY_SOL_ADDRESS` | Address hard-set in the vault at deploy |
| ☐ | Kora (hosted or self-run, S14) | B | `KORA_URL` | Only for seed-phrase users on Solana |
| ☐ | RPCs: Arc, Base, Ethereum, Arbitrum, Solana (Helius or similar) | B | `RPC_ARC` … `RPC_SOLANA` | Paid tier for Solana if rate-limited |
| ☐ | Neon project, branches `dev` + `demo` | B | `DATABASE_URL` | |
| ☐ | Vercel project on **Pro** (D15), cron enabled | All | `CRON_SECRET` | |
| ☐ | VAPID keys (`web-push generate-vapid-keys`) | F | `VAPID_PUBLIC`, `VAPID_PRIVATE` | |
| ☐ | App secrets | B | `SESSION_SECRET`, `TOKEN_ENC_KEY` (32 bytes) | `openssl rand -base64 32` |
| ☐ | Vault owner: Safe 2-of-3 if Safe is on Arc (S16), else a hardware EOA | C | `VAULT_OWNER` | |
| ☐ | Team USDC: about $50 on Arc + $1 on each other chain for smoke tests | All | — | |
| ☐ | GitHub repo (public at submission), MIT license | All | — | |

## Spikes

Answer these before building on them. Fill in **Result** with a link to the tx or doc. A "no" switches to the fallback.

| # | Question | Owner | Fallback if no | Result |
|---|---|---|---|---|
| S1 | CCTP V2 Arc (26) → Solana (5) with $2 real USDC; time to attestation | B | Arc → Base (6) and buy AAPLc on Base | |
| S2 | Arc Studio can deploy to Arc mainnet | C | Build + test in Studio, deploy with Foundry, show both | |
| S3 | Jupiter Swap V2 accepts a destination token account (output to the user) | B | Swap into the relay, then SPL transfer to the user in the same transaction | |
| S4 | Gas Station sponsors user-controlled SCA transactions on Arc mainnet (Arc's docs list only third-party paymasters, 6 Nov) | B | User pays fractions of a cent in USDC | |
| S5 | Keep Gateway next to the forwarder? (Gateway on Solana mainnet and the API base URL weren't in Circle's docs on 6 Nov) | B | Drop Gateway; CCTP only | |
| S6 | Circle SCA has the **same address** on Arc, Base, Ethereum and Arbitrum for one user | B | Show one address per chain on Fund and Wallet (wireframe change) | |
| S7 | Circle Google login works for a non-team Google account | B | Seed-phrase path for judges | |
| S8 | Gmail scope works for a test user; how the warning screen looks | B | Demo with the team's inbox | |
| S9 | Verified token + live pool for each registry asset (Apple, TSMC, Qualcomm, Corning, Unilever, Nike, Coca-Cola, PepsiCo, gold, silver, S&P 500) | B | Mark the asset "not tokenized yet" | |
| S10 | 0G: chosen models live, private mode header works, request ID returned; p50 latency of the receipt read | B | Swap to another listed model | |
| S11 | Arkiv SDK create + query on the current testnet | B | — | **Done 6 Nov:** SDK 1.0.1, Rabdi; query type-checked and run live ([scripts/arkiv-check.ts](../scripts/arkiv-check.ts)); write type-checked, needs tGLM to run |
| S12 | Circle user-controlled SCA can sign EIP-712 (Gateway burn intent) and run `contractExecution` on Arc | B | CCTP path instead of Gateway | |
| S13 | Vercel Pro limits: cron frequency, function max duration ≥ 120 s | B | Split the keeper per venue; or run the keeper on Railway | |
| S14 | Kora hosted vs self-run | B | Self-run on Railway/Fly; or seed users deposit on Arc/Base | |
| S15 | Base route for Corning (App Kit Swap or Uniswap Trading API) | B | Corning "not tokenized yet" | |
| S16 | Safe deployed on Arc mainnet | C | Hardware EOA owner | |
| S17 | CCTP V2 fast-transfer fee and time from Ethereum/Base/Arbitrum to Arc; `depositForBurnWithHook` + vault as `destinationCaller` works | B + C | Standard transfer | |
| S18 | Reference price feed for xStocks (Pyth equity feeds on Solana, or Jupiter price API) | B | Jupiter price API only, with a tighter 1% band | |
| S19 | BNB route: which audited bridge reaches BNB from Base/Arbitrum, fees, which dollar token, PancakeSwap pools for target assets | B | Keep `VENUE_BNB` off | |
| S20 | Circle typed-data signing (EIP-712 with arrays) from a user-controlled SCA, and ERC-1271 check on Arc | B + C | BuyApproval as an on-chain `approveBuy` tx (one more challenge) | |
| S0 | Public contract addresses (USDC, CCTP, Gateway) | B | — | **Done 6 Nov:** 3 sources each, incl. on-chain reads ([contracts/chain-config.md](../contracts/chain-config.md)) |

## Phases

| Phase (IST) | C | B | F | Exit (the checkpoint from [07](07-testing-and-demo.md#integration-checkpoints)) |
|---|---|---|---|---|
| Thu 21:00–23:00 | Arc Studio project; vault skeleton | Accounts; S1, S3, S10, S11; `packages/shared` with chains + states | Next.js + PWA shell, tab bar, routes stubbed, MSW mocks from `api.ts` | IC1 · shared enums merged |
| Thu 23:00–Fri 05:00 | Vault + full test list; fork tests; deploy to mainnet (S2) | 0G read + match; FX; DB migration 0001; registry import to Arkiv; API routes against the DB | Onboarding, Add funds, Add a purchase, Confirm screens on mocks | IC2, IC3 · ABI and API frozen at 01:00 |
| Fri 05:00–12:00 | Support the keeper; `returnToJar` path test on fork | Keeper (CCTP + Jupiter); Circle sign-in + wallets; deposit watcher; Gateway (S5) | Dashboard, Holdings, Holding, Jars, Buy screens on mocks | IC4, IC5 |
| Fri 12:00–20:00 | Freeze; verify contract on the explorer | Gmail scan; Activity events; push; share card | Swap mocks for the real API; state boards; copy catalog; design tokens | IC6 |
| Fri 20:00–Sat 03:00 | Security checklist pass | Gmail with test users; voice; iAI bonus if time; bug fixes | Bug fixes; offline; accessibility pass | All R-tests green |
| Sat 03:00–08:00 | Studio screenshots/recording for the video | README, `/arkiv` files, AI-use note | Video capture | IC7 · submission draft |
| Sat 08:00–09:00 | — | — | — | **Submit.** No new features after 07:00 |

## Working rules (to avoid integration bugs)

1. **`packages/shared` first.** Nobody writes a chain address, state name, route path, error code or ABI by hand anywhere else.
2. **The frontend never waits on the backend.** Build every screen against MSW mocks generated from `api.ts` and fixtures from the wireframes, using the corrected numbers in [03](03-decisions-and-open-questions.md).
3. **Small PRs to `main`**, each with a passing `pnpm check` (typecheck + lint + unit tests). A shared change needs one review from another owner.
4. **Mainnet writes only from scripts or the app**, never from ad-hoc consoles. Every tx hash goes into the Spikes table or `docs/tx-log.md`.
5. **Feature flags** in env: `KEEPER_ENABLED`, `GMAIL_ENABLED`, `VENUE_BASE`, `VENUE_ETHEREUM`, `OG_SIGNIN`. Unfinished work merges dark.
6. **Freeze points:** shared enums Thu 23:00 · ABI + API + DB Fri 01:00 · copy Fri 12:00 · features Sat 07:00.

## Go / no-go before the demo (Sat 06:00)

| ✓ | Check |
|---|---|
| ☐ | Vault verified on the Arc explorer; owner and keeper addresses are what we expect; not paused |
| ☐ | Demo user: Google sign-in works on the stage phone; Solana address funded with nothing but holdings |
| ☐ | Demo user's free balance ≥ the demo purchase; monthly limit has room |
| ☐ | Sponsors funded: Gas Station ≥ $5, relay SOL ≥ 0.05, Kora ≥ $2 |
| ☐ | 0G credits ≥ 50 reads; private mode on |
| ☐ | Registry: the demo receipt's maker and suppliers resolve, and their mints match the issuer list |
| ☐ | Jupiter quote for AAPLx works from the venue; price impact for $5–$50 < 1% |
| ☐ | Arkiv explorer link opens the latest proof |
| ☐ | Backup recording on the laptop and on a phone |
| ☐ | `KEEPER_ENABLED=true` on demo; the demo user's BuyApproval flow works end to end (the Sunday cron only sends reminders) |
| ☐ | Phone: PWA on the home screen, notifications allowed, brightness up, Do Not Disturb on |
