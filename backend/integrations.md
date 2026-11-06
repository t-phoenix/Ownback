# Integrations

How we call each external service: SDK or endpoint, what we send, limits, and what happens when it fails. Every client lives in `apps/web/lib/<service>/`, and every call has a timeout and maps failures to `UPSTREAM`.

## Circle (Arc partner)

| Piece | Used for | How | Fails → |
|---|---|---|---|
| **User-controlled wallets: social login** | Google sign-in, user wallets | Server: create a device token for the Web SDK (`/api/auth/google/device-token`). Client: Web SDK `performLogin(Google)` → `userToken` + `encryptionKey`. Server: verify the token by calling Circle as that user; first time, `initialize user` with `blockchains: [ARC, BASE, ETH, ARB, SOL]` and `accountType: SCA` (EVM) → `challengeId` for the client | `AUTH_INVALID`. The seed path stays available |
| **Contract execution** | Every user action on Arc (setRules, deposit, allocate, cancelJar, withdraw) | Server creates a user transaction (contract execution: vault address, ABI function, params, `feeLevel`) with the user's `userToken` → `challengeId` → client runs it in the SDK | `CHALLENGE_FAILED`; nothing moved |
| **Typed-data signing** | **BuyApproval** (every buy, Q7); Gateway burn intent if used | `signTypedData` challenge; verified on Arc with ERC-1271 (S20) | Fallback: user calls vault `approveBuy(BuyApproval)` via Circle challenge; see vault-spec S20 |
| **Gas Station** | Sponsors user and keeper SCAs | Console policy per chain ([docs/05](../docs/05-gasless-and-fees.md)). No code: transactions just use `feeLevel` | User pays on Arc (USDC) |
| **Developer-controlled wallet** | Keeper on Arc; relays on Base/Ethereum | `@circle-fin/developer-controlled-wallets`: `createContractExecutionTransaction` with the entity secret | Keeper run fails safely; nothing left the vault |
| **Gateway** | One dollar balance across chains | App Kit "Unified Balance", or Gateway API: deposit on the source chain → burn intent → attestation → `gatewayMint` on Arc | Q3 option A / CCTP fallback |
| **CCTP V2 (App Kit Bridge)** | Vault → relay, relay → vault, withdraw cross-chain, deposit fallback | Burn happens in the vault (`depositForBurn`). The server polls the attestation API, then calls `receiveMessage` on the destination (Solana: relay pays; EVM: keeper dev wallet) | Poll every 5 s, mark slow after 3 min, keep going; the money is safe in CCTP |
| **Paymaster** | Seed users paying EVM gas in USDC | Client: viem account abstraction + Circle Paymaster (EntryPoint v0.8 / EIP-7702) | EIP-3009 relayer |

Things to note:
- `userToken` lasts about 60 min. On `401` from Circle, the client re-runs the Google login silently and retries.
- Never store `encryptionKey` server-side beyond the request.
- Circle webhook (optional, recommended): subscribe to inbound transfer notifications for the user wallets. This speeds up the deposit watcher. Verify the webhook signature.

## 0G Private Computer

- OpenAI SDK with `baseURL: 'https://router-api.0g.ai/v1'`, `apiKey: OG_API_KEY`, and header `X-0G-Provider-Trust-Mode: private` on every call.
- Store the request ID from each response (header or body, confirmed in S10) in `ai_runs`, and show it in Reading, Confirm and the proof trail.
- Timeouts: vision 20 s, text 10 s. One retry on 5xx. JSON mode + zod parse, with one repair retry on a parse failure.
- Models, prompts and schemas: [ai-spec.md](ai-spec.md).
- iAI bonus (flag `OG_SIGNIN`): OAuth with the user's 0G account; calls are billed to their credits. Ask at the booth for the endpoints. Only works on `localhost:3000`.

## Jupiter (Solana venue)

| Call | Use |
|---|---|
| Price API | Prices for Holdings, Jars ("price now"), balance; cache 60 s |
| Swap V2 quote | Buy review (`amount` = jar USDC, `slippageBps` = 100), keeper re-quote |
| Swap V2 build | Keeper: `inputMint` USDC, `outputMint` = verified mint, `taker` = relay, **destination = the user's token account** (S3), `payer` = relay (fees + ATA rent) |

Check before every swap: the `outputMint` equals the Arkiv `asset` mint for that asset and chain, `priceImpactPct ≤ 1%`, and the out amount ≥ `amount / maxPrice`.

Fallback (if S3 = no): swap with output to the relay's ATA, then add an SPL `transferChecked` to the user's ATA **in the same transaction**.

## Other venues (Q5)

Venue adapters share one interface: `quote(asset, amountUsd6) → { price, impact, fees: Fees, route }` and `swap(route, recipient)`. The router picks the cheapest all-in route that passes the reference price check and the user's fee cap.

| Venue | How |
|---|---|
| Base / Ethereum / Arbitrum | App Kit Swap first, then the Uniswap Trading API (quote → calldata). Relay = Circle dev wallet on that chain; private RPC send (MEV); recipient = the user's EVM address |
| BNB Chain (`VENUE_BNB`) | Base relay → audited bridge (S19; per-transfer and daily caps) → BNB dollar token → PancakeSwap → user's EVM address. If any leg fails, return to the jar. BNB has no Circle USDC, so balances there are never shown as USDC |

## Reference prices (A4)

Pyth price feeds for the underlying (S18), or the Jupiter price API across all pools. A quote more than 2% from the reference → the item waits.

## Arkiv

`@arkiv-network/sdk` **1.0.1** (npm `latest`, verified 6 Nov) on the Rabdi testnet (chain 7794095), `rabdi({ accessKey: ARKIV_ACCESS_KEY })`, writer key `ARKIV_WRITER_KEY`. It's schema-based (`defineSchema`), with lifetimes via `ExpirationTime` (max about 182 days). **Every read uses `.createdBy(writer).ownedBy(writer)` (A1).** Entities and queries: [database/arkiv-schema.md](../database/arkiv-schema.md); runnable check: [scripts/arkiv-check.ts](../scripts/arkiv-check.ts).
- Reads are cached 5 min in memory per instance.
- Writes go through one queue, so nonces don't collide.
- If a proof write fails, retry 3 times; the buy is not rolled back. "Public record" shows "pending" until it's written.

## Gmail

- OAuth 2.0 web flow, incremental scope `https://www.googleapis.com/auth/gmail.readonly`, `access_type=offline`, `include_granted_scopes=true`. Asked only when the user taps (never at sign-in).
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
