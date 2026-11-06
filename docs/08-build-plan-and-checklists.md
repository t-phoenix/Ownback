# 08 · Build plan and checklists

Times are taken from the PRD's 36-hour plan. If we're behind, keep the **order**, not the times. Owners: **C** = contracts, **B** = backend, **F** = frontend, **All**. Put names next to the letters once the team is set.

## Accounts and secrets

Do these first: most spikes are blocked without them. Each secret goes into Vercel env (`demo` and `local`) and its name into `.env.example`.

| ✓ | Account / setup | Owner | Produces (env names) | Notes |
|---|---|---|---|---|
| ☐ | **Privy** app: Google login, embedded **smart wallets** (EVM), **Solana** wallets; allow Arc (5042) | B | `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `NEXT_PUBLIC_PRIVY_APP_ID` | Q9 — primary Google path |
| ☐ | Keeper EOA on Arc (funded with USDC for gas) | B | `KEEPER_PRIVATE_KEY`, `KEEPER_ADDRESS` | Not Circle developer wallets |
| ☐ | EVM relayer EOAs (forwarder / Base venue) when `AUTO_ADD_EVM` or Base venue on | B | `RELAYER_PRIVATE_KEYS` | D27: auto-add off until sponsor spike |
| ☐ | Arc Studio project created (the vault starts here) | C | `ARC_STUDIO_URL` (for the README) | Required for the Arc prize |
| ☐ | Google Cloud: OAuth client (web) for **Gmail only**; consent screen published or test users; `gmail.readonly` | B | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Login is Privy; this is inbox scan only. Restricted scope ≤ 100 test users |
| ☐ | 0G Private Computer account + credits | B | `OG_API_KEY` | Ask at the booth about "sign in with 0G" (bonus) |
| ☐ | Arkiv: access key (hub.arkiv.network/access-keys) + writer wallet with tGLM (hub.arkiv.network/faucet) | B | `ARKIV_ACCESS_KEY`, `ARKIV_WRITER_KEY`, `ARKIV_WRITER_ADDRESS` | SDK 1.0.1, Rabdi. The address goes in the README (prize rule) |
| ☐ | Solana deposit relay keypair (A15) | B | `DEPOSIT_RELAY_SOL_KEY` | Separate from the buy relay |
| ☐ | 2FA on Vercel, GitHub, Privy, Google Cloud, Neon, domain registrar (A20) | All | — | Before any deploy |
| ☐ | Solana buy relay keypair, ≥ $0.10 SOL (D26 gas/rent) | B | `RELAY_SOL_KEY`, `RELAY_SOL_ADDRESS` | Address hard-set in the vault at deploy; alert if SOL &lt; 0.05 |
| ☐ | Kora (hosted or self-run, S14) | B | `KORA_URL` | Solana deposit fee payer (Privy + seed) |
| ☐ | *(Optional)* Circle Developer Console if verification works later | B | `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `CIRCLE_APP_ID`, `NEXT_PUBLIC_CIRCLE_APP_ID` | Not required to ship (Q9) |
| ☐ | RPCs: Arc, Base, Ethereum, Arbitrum, Solana (Helius or similar) | B | `RPC_ARC`, `RPC_BASE`, `RPC_ETHEREUM`, `RPC_ARBITRUM`, `RPC_SOLANA` | Arc public RPC: `https://rpc.mainnet.arc.io`. Paid tier for Solana if rate-limited |
| ☐ | Neon project, branches `dev` + `demo` | B | `DATABASE_URL` | |
| ☐ | Vercel project on **Pro** (D15), cron enabled | All | `CRON_SECRET` | |
| ☐ | VAPID keys (`web-push generate-vapid-keys`) | F | `VAPID_PUBLIC`, `VAPID_PRIVATE`, `NEXT_PUBLIC_VAPID_PUBLIC` (same value as `VAPID_PUBLIC`) | |
| ☐ | After deploy: vault and forwarder addresses | C | `VAULT_ADDRESS` (+ forwarder addresses in `packages/shared/chains.ts`) | From [contracts/deployment.md](../contracts/deployment.md) |
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
| S-Privy | Privy smart wallet on Arc (5042) + Solana embedded; ERC-1271 BuyApproval EIP-712; note Base gas sponsorship | B | Seed path for demo; Arc-only fund | |
| S4 | *(Circle Gas Station)* — superseded by Q9 | B | User pays fractions of a cent in USDC; $0.10 buffer | **Fallback locked (Q9)** |
| S5 | Keep Gateway next to the forwarder? | B | Drop Gateway; CCTP only | **Done Q9: CCTP only** |
| S6 | Privy smart wallet same address across Arc / Base / Eth / Arb (or document per-chain) | B | Show one address per chain on Fund and Wallet | |
| S7 | Privy Google login works for a non-team Google account | B | Seed-phrase path for judges | |
| S8 | Gmail scope works for a test user; how the warning screen looks | B | Demo with the team's inbox | |
| S9 | Verified token + live pool for each registry asset (Apple, TSMC, Qualcomm, Corning, Unilever, Nike, Coca-Cola, PepsiCo, gold, silver, S&P 500) | B | Mark the asset "not tokenized yet" | |
| S10 | 0G: chosen models live, private mode header works, request ID returned; p50 latency of the receipt read | B | Swap to another listed model | **Done 7 Nov:** private TeeML — vision `0GM-1.0-35B-A3B` (`0xf4FB…`), LLM `glm-5.3` (`0xD179…`), embed `qwen3-embedding-0.6b`, whisper `openai/whisper-large-v3`; request IDs via `x_0g_trace.request_id` ([scripts/og-check.ts](../scripts/og-check.ts)) |
| S11 | Arkiv SDK create + query on the current testnet | B | — | **Done 6 Nov:** SDK 1.0.1, Rabdi; query type-checked and run live ([scripts/arkiv-check.ts](../scripts/arkiv-check.ts)); write type-checked, needs tGLM to run |
| S12 | Privy smart wallet can send contract txs on Arc | B | Seed path; or Arc-only demo | |
| S13 | Vercel Pro limits: cron frequency, function max duration ≥ 120 s | B | Split the keeper per venue; or run the keeper on Railway | |
| S14 | Kora hosted vs self-run | B | Self-run on Railway/Fly; or seed users deposit on Arc/Base | |
| S15 | Base route for Corning (App Kit Swap or Uniswap Trading API) | B | Corning "not tokenized yet" | |
| S16 | Safe deployed on Arc mainnet | C | Hardware EOA owner | |
| S17 | CCTP V2 fast-transfer fee and time from Ethereum/Base/Arbitrum to Arc; `depositForBurnWithHook` + vault as `destinationCaller` works | B + C | Standard transfer | |
| S18 | Reference price feed for xStocks (Pyth equity feeds on Solana, or Jupiter price API) | B | Jupiter price API only, with a tighter 1% band | |
| S19 | BNB route: which audited bridge reaches BNB from Base/Arbitrum, fees, which dollar token, PancakeSwap pools for target assets | B | Keep `VENUE_BNB` off | |
| S20 | Privy smart wallet typed-data (EIP-712 with arrays) + ERC-1271 on Arc | B + C | `approveBuy(BuyApproval)` on-chain; keeper needs that record before `execute` | |
| S26 | EVM auto-add gas sponsor (Privy sponsorship or paymaster) | B | Keep `AUTO_ADD_EVM=false` (D27); Fund = Arc | |
| S0 | Public contract addresses (USDC, CCTP, Gateway) | B | — | **Done 6 Nov:** 3 sources each, incl. on-chain reads ([contracts/chain-config.md](../contracts/chain-config.md)) |

## Phases

| Phase (IST) | C | B | F | Exit (the checkpoint from [07](07-testing-and-demo.md#integration-checkpoints)) |
|---|---|---|---|---|
| Thu 21:00–23:00 | Arc Studio project; vault skeleton | Accounts; S1, S3, S10, S11; `packages/shared` with chains + states | Next.js + PWA shell, tab bar, routes stubbed, MSW mocks from `api.ts` | IC1 · shared enums merged |
| Thu 23:00–Fri 05:00 | Vault + full test list; fork tests; deploy to mainnet (S2) | 0G read + match; FX; DB migration 0001; registry import to Arkiv; API routes against the DB | Onboarding, Add funds, Add a purchase, Confirm screens on mocks | IC2, IC3 · ABI and API frozen at 01:00 |
| Fri 05:00–12:00 | Support the keeper; `returnToJar` path test on fork | Keeper EOA (CCTP + Jupiter); Privy sign-in + wallets (S-Privy); deposit watcher; CCTP only | Dashboard, Holdings, Holding, Jars, Buy screens on mocks | IC4, IC5 |
| Fri 12:00–20:00 | Freeze; verify contract on the explorer | Gmail scan; Activity events; push; share card | Swap mocks for the real API; state boards; copy catalog; design tokens | IC6 |
| Fri 20:00–Sat 03:00 | Security checklist pass | Gmail with test users; voice; iAI bonus if time; bug fixes | Bug fixes; offline; accessibility pass | All R-tests green |
| Sat 03:00–08:00 | Studio screenshots/recording for the video | README, `/arkiv` files, AI-use note | Video capture | IC7 · submission draft |
| Sat 08:00–09:00 | — | — | — | **Submit.** No new features after 07:00 |

## Working rules (to avoid integration bugs)

1. **`packages/shared` first.** Nobody writes a chain address, state name, route path, error code or ABI by hand anywhere else.
2. **The frontend never waits on the backend.** Build every screen against MSW mocks generated from `api.ts` and fixtures from the wireframes, using the corrected numbers in [03](03-decisions-and-open-questions.md).
3. **Small PRs to `main`**, each with a passing `pnpm check` (typecheck + lint + unit tests). A shared change needs one review from another owner.
4. **Mainnet writes only from scripts or the app**, never from ad-hoc consoles. Every tx hash goes into the Spikes table or `docs/tx-log.md`.
5. **Feature flags** in env: `KEEPER_ENABLED`, `GMAIL_ENABLED`, `AUTO_ADD_EVM`, `VENUE_BASE`, `VENUE_ETHEREUM`, `VENUE_ARBITRUM`, `VENUE_BNB`, `MOCK_CHAIN`, `OG_SIGNIN`. Unfinished work merges dark.
6. **Freeze points:** shared enums Thu 23:00 · ABI + API + DB Fri 01:00 · copy Fri 12:00 · features Sat 07:00.

## Post-docs implementation (Q9 · separate code PRs)

Docs cascade is done. Code order (keep mocks green until each spike passes):

1. **S-Privy** — smart wallet on Arc + Solana; ERC-1271 sample EIP-712; note Base sponsorship.
2. **Auth** — `POST /api/auth/privy`; store addresses; session cookie; drop Circle device-token routes.
3. **SignableAction runner** — PWA executes `evm_calls` / `typed_data` / `sol_tx` via Privy.
4. **Keeper** — viem EOA (`KEEPER_*`); Iris CCTP poll; Jupiter `payer` = relay.
5. **Flags** — `AUTO_ADD_EVM=false` until S26; alert if `RELAY_SOL` &lt; 0.05.

## Go / no-go before the demo (Sat 06:00)

| ✓ | Check |
|---|---|
| ☐ | Vault verified on the Arc explorer; owner and keeper addresses are what we expect; not paused |
| ☐ | Demo user: Privy Google sign-in works on the stage phone; Solana address has holdings only (no SOL needed for buys, D26) |
| ☐ | Demo user's free balance ≥ the demo purchase; monthly limit has room |
| ☐ | Sponsors funded: keeper Arc USDC ≥ $3, relay SOL ≥ 0.05, Kora ≥ $2 |
| ☐ | 0G credits ≥ 50 reads; private mode on |
| ☐ | Registry: the demo receipt's maker and suppliers resolve, and their mints match the issuer list |
| ☐ | Jupiter quote for AAPLx works from the venue; price impact for $5–$50 < 1% |
| ☐ | Arkiv explorer link opens the latest proof |
| ☐ | Backup recording on the laptop and on a phone |
| ☐ | `KEEPER_ENABLED=true` on demo; the demo user's BuyApproval flow works end to end (the Sunday cron only sends reminders) |
| ☐ | Phone: PWA on the home screen, notifications allowed, brightness up, Do Not Disturb on |
