# Integrations

How we call each external service: SDK or endpoint, what we send, limits, and what happens when it fails. Every client lives in `apps/web/lib/<service>/`, and every call has a timeout and maps failures to `UPSTREAM`.

## Privy (Google wallets · Q9)

| Piece | Used for | How | Fails → |
|---|---|---|---|
| **Google login** | Sign-in | PWA: Privy SDK Google login → access token. `POST /api/auth/privy` verifies with Privy server API / JWT; upserts user with EVM smart-wallet address + Solana address | `AUTH_INVALID`. Seed path stays available |
| **EVM smart wallet** | Rules, deposit, allocate, cancel, withdraw, BuyApproval | PWA runs `SignableAction` `evm_calls` / `typed_data` via Privy. Vault verifies BuyApproval with ERC-1271 (`SignatureChecker`). S20 fallback: on-chain `approveBuy` if typed-data with arrays fails | `CHALLENGE_FAILED` / tx revert; nothing moved |
| **Solana wallet** | One-tap Solana deposits; `setSolanaRecipient` = **USDC ATA derived from Privy `solAddress`** (D28) | Privy Solana signer for `sol_tx`. Fee payer = Kora or deposit relay (not the user). RWA ATAs derived at Jupiter swap time | User retries; seed Solana path available |

Env: `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `NEXT_PUBLIC_PRIVY_APP_ID`. Never store Privy access tokens server-side beyond the login request.

## CCTP V2 + keeper EOAs (no Circle Console required)

| Piece | Used for | How | Fails → |
|---|---|---|---|
| **CCTP V2** | Vault → venue relay, relay → vault, withdraw cross-chain, Solana deposit → Arc | Vault / forwarder `depositForBurn`. Server polls Iris attestation API, then `receiveMessage` on destination (**Solana: buy relay pays SOL**; EVM: keeper/relayer EOA) | Poll every 5 s, mark slow after 3 min, keep going; money safe in CCTP |
| **Keeper EOA** | `vault.execute`, Arc legs | `viem` + `KEEPER_*` private key / address (not Circle developer-controlled wallets) | Keeper run fails safely; nothing left the vault |
| **EVM relayers** | Forwarder `forward`, Base venue receive/swap | Funded EOAs (`RELAYER_*`) | Job retries; deposit stays `needs_approval` / jar waits |
| **Solana buy relay** | CCTP mint + Jupiter swap (D26) | `RELAY_SOL_KEY`: `receiveMessage`, then Jupiter with `taker` = relay, **`payer` = relay**, **destination = user's ATA**. Alert if SOL &lt; 0.05 | Return USDC to vault → `returnToJar` (we pay) |
| **Solana deposit relay** | Google/seed one-tap deposit (A15) | SPL into deposit account → CCTP burn with `hookData = user` → `receiveDeposit` | Cap $500/deposit; user retries |

Gateway / App Kit / Gas Station / Circle user wallets: **out for this build** (Q9). Optional if Circle Console verification later succeeds.

## 0G Private Computer

- OpenAI-compatible `https://router-api.0g.ai/v1` with `OG_API_KEY`. Client: `src/lib/og/client.ts`.
- Every call: `X-0G-Provider-Trust-Mode: private` + `X-0G-Provider-Address` for the TeeML pin in [ai-spec.md](ai-spec.md) / `src/lib/og/models.ts`.
- Request ID: prefer `x_0g_trace.request_id`; store in `ai_runs`; show on Reading, Confirm, proof trail.
- Timeouts: vision 20 s, text 10 s. One retry on 5xx. JSON mode + zod parse, with one repair retry on a parse failure.
- Models: private `0GM-1.0-35B-A3B` (vision), `glm-5.3` (text), `qwen3-embedding-0.6b`, `openai/whisper-large-v3`. Smoke: `scripts/og-check.ts`.
- iAI bonus (flag `OG_SIGNIN`): OAuth with the user's 0G account; calls are billed to their credits. Ask at the booth for Privy app ID / endpoints. Only works on `localhost:3000` / `3001` / `5173`.

## Jupiter (Solana venue)

| Call | Use |
|---|---|
| Price API | Prices for Holdings, Jars ("price now"), balance; cache 60 s |
| Swap V2 quote | Buy review (`amount` = jar USDC, `slippageBps` = 100), keeper re-quote |
| Swap V2 build | Keeper: `inputMint` USDC, `outputMint` = verified mint, `taker` = relay, **destination = the user's token account** (S3), `payer` = relay (fees + ATA rent) — D26 |

Check before every swap: the `outputMint` equals the Arkiv `asset` mint for that asset and chain, `priceImpactPct ≤ 1%`, and the out amount ≥ `amount / maxPrice`.

Fallback (if S3 = no): swap with output to the relay's ATA, then add an SPL `transferChecked` to the user's ATA **in the same transaction**.

## Other venues (Q5)

Venue adapters share one interface: `quote(asset, amountUsd6) → { price, impact, fees: Fees, route }` and `swap(route, recipient)`. The router picks the cheapest all-in route that passes the reference price check and the user's fee cap.

| Venue | How |
|---|---|
| Base / Ethereum / Arbitrum | Uniswap Trading API (quote → calldata) or App Kit Swap if available. Relay = EOA on that chain; private RPC send (MEV); recipient = the user's EVM address |
| BNB Chain (`VENUE_BNB`) | Base relay → audited bridge (S19; per-transfer and daily caps) → BNB dollar token → PancakeSwap → user's EVM address. If any leg fails, return to the jar. BNB has no native Circle USDC, so balances there are never shown as USDC |

## Reference prices (A4)

Pyth price feeds for the underlying (S18), or the Jupiter price API across all pools. A quote more than 2% from the reference → the item waits.

## Arkiv

`@arkiv-network/sdk` **1.0.1** (npm `latest`, verified 6 Nov) on the Rabdi testnet (chain 7794095), `rabdi({ accessKey: ARKIV_ACCESS_KEY })`, writer key `ARKIV_WRITER_KEY`. It's schema-based (`defineSchema`), with lifetimes via `ExpirationTime` (max about 182 days). **Every read uses `.createdBy(writer).ownedBy(writer)` (A1).** Entities and queries: [database/arkiv-schema.md](../database/arkiv-schema.md); runnable check: [scripts/arkiv-check.ts](../scripts/arkiv-check.ts).
- Reads are cached 5 min in memory per instance.
- Writes go through one queue, so nonces don't collide.
- If a proof write fails, retry 3 times; the buy is not rolled back. "Public record" shows "pending" until it's written.

## Gmail

- OAuth 2.0 web flow, incremental scope `https://www.googleapis.com/auth/gmail.readonly`, `access_type=offline`, `include_granted_scopes=true`. Asked only when the user taps (never at sign-in). Uses `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (not Privy).
- `users.messages.list` with `q = from:(<shop allowlist>) newer_than:30d`. Allowlist: Amazon, Flipkart, Myntra, Croma, Nykaa, Swiggy Instamart, Blinkit, BigBasket, Apple, Zepto, Ajio, Tata CLiQ, Uber (to mark as not a product).
- `users.messages.get?format=full` → **skip unless `Authentication-Results` shows `dkim=pass` for the shop's domain (A8)** → text/plain or HTML-to-text, truncated to 12k characters → 0G → drop the body.
- OAuth: `state` = HMAC(session ID, nonce) + PKCE; the callback rejects a mismatch (A12).
- Store only `messageId`, sender domain, status and the purchase link.
- `invalid_grant` → state `revoked`.
- Restricted scope: an unverified app allows at most 100 test users and shows a warning (S8).

## FX: Frankfurter

`GET https://api.frankfurter.app/{date}?from=USD&to=INR` (ECB reference rates, no key). Cache per (date, currency) in `fx_rates`. Store the rate, source and fetch time with the purchase. For weekends or holidays, Frankfurter returns the last business day; store the returned date. If it's down, use the most recent cached rate and mark the source `cache`.

## Web Push

`web-push` with VAPID. One subscription per device, stored in `push_subscriptions`. On `410 Gone`, delete the subscription. iOS needs the PWA added to the home screen.

## Wikidata

Used by the match step's tool call: `wbsearchentities` (brand) → P127 (owned by) / P749 (parent org) → P414 (stock exchange) + P249 (ticker). 5 s timeout, cached 7 days. If it's down, use the Arkiv registry only.
