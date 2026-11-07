# API contract

This becomes `packages/shared/api.ts`: one zod schema per request and response. The frontend's MSW mocks and the backend's handlers both import it. **It freezes Fri 01:00**: after that, only additive changes are allowed.

## Conventions

| Rule | Detail |
|---|---|
| Base | Same origin, `/api/*`. JSON in and out, except the image/audio upload (multipart) |
| Auth | `ob_session` cookie holding an opaque session ID (HttpOnly, Secure, SameSite=Lax; 24 h sliding, 7 days max; revocable in the `sessions` table, A11). Every route needs it unless marked **public** |
| CSRF | State-changing requests send header `x-ob-csrf` = value of the `ob_csrf` cookie (double submit) |
| Money | `Usd6` = string of digits in micro-USDC (`"47750000"` = $47.75). Never a number |
| Local money | `{ amount: string, currency: "INR" }` as a decimal string (`"79900.00"`), only on receipt fields |
| Time | ISO 8601 UTC strings |
| IDs | UUID v7 strings; `assetId` = slug (`co:apple`) |
| Idempotency | Every POST that moves money or creates a purchase takes header `Idempotency-Key` (UUID). Same key + same body → same response for 24 h |
| Pagination | `?cursor=…&limit=20` → `{ items, nextCursor }` |
| Errors | Non-2xx returns `{ error: { code: ErrorCode, retryable: boolean, details?: object } }`. The UI maps `code` to copy and never shows it |
| Privy session | Google users authenticate once via `POST /api/auth/privy`. After that the `ob_session` cookie is enough. The PWA signs `SignableAction`s with Privy client-side; the server never holds Privy access tokens beyond the login request |

## Shared types

```ts
type Usd6 = string;
type AssetId = string;            // 'co:apple' | 'mat:gold' | 'idx:sp500' | …
type ChainKey = 'arc' | 'solana' | 'base' | 'ethereum' | 'arbitrum' | 'bnb';   // 'bnb' only for venues/holdings, never for deposits or withdrawals
type DepositChain = Exclude<ChainKey, 'bnb'>;

type AssetRef = { assetId: AssetId; name: string; ticker?: string; token?: string; chain?: ChainKey;
                  role: 'maker' | 'supplier' | 'material' | 'fallback'; why?: string; tokenized: boolean };

type Price = { usd6PerUnit: Usd6 /* per 1 whole token */; at: string; source: 'jupiter' | 'uniswap' | 'appkit' | 'aerodrome' | 'pancakeswap' | 'pyth' };
type Eip712 = { domain: { name: 'OwnbackVault'; version: '1'; chainId: 5042; verifyingContract: string };
                types: Record<string, { name: string; type: string }[]>; primaryType: 'BuyApproval'; message: Record<string, unknown> };
type Withdrawal = { id; chain: DepositChain; amountUsd6: Usd6; feeUsd6: Usd6; status: 'sending' | 'sent' | 'failed'; arcTx?: string; mintTx?: string; createdAt: string };
// Status enums (DepositStatus, PurchaseStatus, JarState, BuyBatchStatus, BuyEntryStatus, GmailState, EventKind) are imported from packages/shared/states.ts (docs/04). Never redeclare them here.
```

### Signable actions

Every action the user must sign comes back in this shape:

```ts
type SignableAction =
  | { kind: 'evm_calls'; chain: ChainKey; calls: { to: string; data: string; value: '0' }[]; summary: string }  // Privy smart wallet or seed: sign locally, in order
  | { kind: 'sol_tx'; txBase64: string; feePayer: 'kora' | 'user' | 'deposit_relay'; summary: string }
  | { kind: 'typed_data'; typedData: Eip712; summary: string }   // BuyApproval: Privy ERC-1271 or seed ecrecover
  | { kind: 'circle_challenge'; challengeIds: string[]; summary: string }  // legacy only; unused when Q9 Privy path is live
  ;
// Every action also carries `fees: Fees` and `expect: { assets: AssetId[]; amountsUsd6: Usd6[] }` so the PWA can decode the calldata itself and refuse a mismatch (A5).
type Fees = { totalUsd6: Usd6; pctBps: number; capBps: number; overCap: boolean; covered: boolean;
              parts: { label: string; usd6: Usd6 }[] };   // e.g. 'Arc network', 'CCTP', 'Solana network', 'Jupiter route', 'New token account'
```

`summary` is the text shown on the approval, for example "Move $47.75 into 6 jars on Arc". After signing, the client calls the matching `…/submitted` route with `{ txHash }` (EVM/Solana) and/or `{ signature }` (typed_data BuyApproval). `challengeIds` is legacy. The server then confirms on-chain itself.

**What the server puts in front of a vault action (in this order, only when needed):**
1. `setRules` (if `onchainSynced` is false)
2. `setSolanaRecipient(ata)` (if the vault has none). Identity is the user's Privy/seed **Solana wallet** (`solAddress`). `ata` is only that wallet's **USDC** ATA (CCTP mintRecipient must be a token account). Derived by the server from `solAddress` + USDC mint + Token program; re-derived by the PWA in `verifyAction` (A6). Never a per-asset RWA ATA — those are derived at Jupiter swap time (D26, docs/03 O7).
3. `usdc.approve(vault, exactAmount)` (before `deposit` / `depositAndAllocate`; exact amount, never unlimited)
4. The action itself.

Google (Privy) and seed users both get these as one `evm_calls` / `typed_data` / `sol_tx` list. The PWA runs them through Privy or local keys. **$0.10 USDC gas buffer** stays in the Arc wallet for Google and seed: `deposit` / `depositAndAllocate` never move it into the vault ([docs/05](../docs/05-gasless-and-fees.md), Q9).

## Routes

### Auth and me

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| POST | `/api/auth/privy` **public** | `{ accessToken }` | `{ user: Me }` (verifies JWT with Privy; upserts `evmAddress` + `solAddress` from linked wallets) | `AUTH_INVALID`, `GEO_BLOCKED` |
| GET | `/api/auth/seed/nonce` **public** | — | `{ nonce, message }` | — |
| POST | `/api/auth/seed` **public** | `{ evmAddress, solAddress, evmSignature, solSignature, nonce }` | `{ user: Me }` | `AUTH_INVALID`, `NONCE_USED` |
| POST | `/api/auth/logout` | `{ everywhere?: boolean }` | `204` (deletes the session row, or all of them) | — |
| GET | `/api/me` | — | `Me` | `UNAUTHENTICATED` |

```ts
type Me = { id; authKind: 'privy' | 'seed'; email?: string; displayName: string;
            evmAddress?: string; solAddress?: string; referralCode: string; onboarded: boolean };
```

### Rules

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/api/rules` | — | `Rules & { onchainSynced: boolean }` | — |
| PUT | `/api/rules` | `Partial<Rules>` | `Rules & { onchainSynced: false }` | `VALIDATION` |

```ts
type Rules = { rateBps: number /*200–1000*/; monthlyCapUsd6: Usd6;
               readyMinUsd6: Usd6 /* default "5000000" ($5); allowed $1–$50; ready/reminder threshold only, not a max (Q1) */;
               maxFeeBps: number /* 50–1000, default 500 (Q2) */; autoAdd: Record<'ethereum'|'base'|'arbitrum', { on: boolean; capUsd6: Usd6 }>;
               fallbackAsset: 'idx:sp500' | 'idx:nasdaq100' | 'mat:gold' | 'crypto:btc' | 'crypto:eth' | 'idx:tbills';
               split: { maker: number; behind: number; materials: number } /* sums to 100 */; buyDay: 'sun' };
```

When `onchainSynced` is false, the next money action the server builds puts `setRules` first. Every change writes a `rules_changed` event and sends a push (A22).

### Home, balance, holdings

| Method | Path | Response |
|---|---|---|
| GET | `/api/home` | `{ balance: Balance, stats: { receipts: number; spendingUsd6; inJarsUsd6 }, topHoldings: HoldingRow[3], recentReceipts: ReceiptRow[2], nextBuy: { at; readyJars: number } }` |
| GET | `/api/holdings?type=all|stocks|commodities|stablecoins|crypto&chain=all|…` | `{ balance: Balance, sections: { key: 'stablecoins'|'makers'|'behind'|'commodities'|'index'|'crypto'; totalUsd6; rows: HoldingRow[] }[] }` |
| GET | `/api/holdings/:assetId` | `HoldingDetail` |

```ts
type Balance = { totalUsd6; byType: { stocksCommodities; stablecoins; crypto }; byChain: Record<ChainKey, Usd6>;
                 pricesAt: string; stale: boolean;
                 usdc: { freeUsd6; inJarsUsd6; arrivingUsd6 } };      // D19
type HoldingRow = { assetId; name; subtitle; qty?: string; token?: string; chain?: ChainKey; valueUsd6: Usd6 };
type HoldingDetail = HoldingRow & { spentThisYearUsd6; price: Price; avgPriceUsd6; paidTotalUsd6;
  buys: { batchId; at; qty; priceUsd6; amountUsd6; fromPurchases: string[] }[];
  proof: ProofTrail; issuerNote: string };
type ProofTrail = { ogRequestId?; arcTx?; cctpMessage?; venueTx?; arkivKey?; links: Record<string, string> };
```

### Add funds

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/api/deposits/address?chain=` | — | `{ chain, address, minUsd6: "1000000", sameAddressChains: ChainKey[] }` | `CHAIN_UNSUPPORTED` |
| GET | `/api/deposits/watch?chain=&since=` | — | `{ checkedAt, deposit?: Deposit }` | — |
| POST | `/api/deposits/:id/approve` | — | `{ action: SignableAction }` (one-tap move: Solana, or auto-add off) | `DEPOSIT_NOT_READY`, `FEES_TOO_HIGH` |
| POST | `/api/deposits/auto-add` | `{ chain, capUsd6 }` | `{ action: SignableAction }` (approve the forwarder once) | `CHAIN_UNSUPPORTED` |
| DELETE | `/api/deposits/auto-add?chain=` | — | `{ action: SignableAction }` (allowance → 0) | — |
| POST | `/api/deposits/:id/submitted` | `{ txHash? , challengeIds? }` | `Deposit` | `TX_NOT_FOUND` |

```ts
type Deposit = { id; chain; amountUsd6; fromAddress; txHash; status: DepositStatus /* states.ts §3 */; fees?: Fees; forwardTx?: string;
                 confirmations: { have: number; need: number }; etaSec?: number; slow: boolean;
                 wrongToken?: { symbol: string; amount: string } };
```

### Purchases (Add, Reading, Confirm, Split, Fix, Not listed, Limit)

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| POST | `/api/purchases` | multipart `image` \| `audio`, or JSON `{ text: { product, amount, currency, maker? } }` | `{ purchaseId }` (status `reading`) | `UPLOAD_TOO_LARGE` (> 8 MB), `UNSUPPORTED_MEDIA` |
| GET | `/api/purchases/:id` | — | `Purchase` (poll every 700 ms while `reading`) | `NOT_FOUND` |
| PUT | `/api/purchases/:id/split` | `{ maker, behind, materials, makerOnly?: boolean, saveForFuture: boolean }` | `Purchase` | `VALIDATION` |
| PUT | `/api/purchases/:id/assets` | `{ deselect: AssetId[] }` (tick boxes on Confirm) | `Purchase` | — |
| GET | `/api/makers/search?q=` | — | `{ items: { companyId; name; ticker; listed; tokenized; token?; chain? }[] }` (Fix the match) | — |
| PUT | `/api/purchases/:id/match` | `{ companyId } \| { privateBrand: true }` | `Purchase` | — |
| PUT | `/api/purchases/:id/fallback` | `{ choice: 'fallback' \| 'skip' }` | `Purchase` | — |
| POST | `/api/purchases/:id/confirm` | `{ amountUsd6?: Usd6 /* partial: "Save $5.00 now". The server scales every selected allocation to this total with largest-remainder rounding in whole cents, and stores the rest as rest_usd6 */ }` + Idempotency-Key | `{ action: SignableAction }` | `INSUFFICIENT_FREE` (details `{ freeUsd6, shortUsd6 }`), `LIMIT_REACHED` (details `{ usedUsd6, capUsd6, leftUsd6 }`), `NOTHING_TO_BUY` |
| POST | `/api/purchases/:id/confirm/submitted` | `{ txHash? , challengeIds? }` | `Purchase` (`saved` once events are read; else `confirming`) | `TX_REVERTED` (details `{ reason }`), `TX_NOT_FOUND` |
| POST | `/api/purchases/:id/report` | `{ note?: string }` | `204` | — |

```ts
type Purchase = {
  id; status: PurchaseStatus; source: 'gmail' | 'photo' | 'voice' | 'typed';
  steps: { key: 'read' | 'convert' | 'maker' | 'behind' | 'buyable'; state: 'done' | 'running' | 'todo'; label: string }[];
  receipt?: { shop; place?; date; items: string[]; local: { amount: string; currency: string }; fxRate: string /* local per $ */; amountUsd6 };
  investUsd6?: Usd6; rateBps?: number;
  split?: { maker: number; behind: number; materials: number };
  allocations?: (AssetRef & { amountUsd6: Usd6; selected: boolean; sourceUrl?: string; quote?: string })[];
  // no capOverflow — per-company max removed (Q1 revised)
  notTokenized?: AssetRef[];                     // Foxconn, aluminium… shown as "not tokenized yet"
  limit?: { usedUsd6; capUsd6; leftUsd6 };
  ogRequestIds: string[];
  restPendingUsd6?: Usd6;                        // Q7
  readError?: 'no_total' | 'no_product' | 'not_a_receipt';
};
```

### Gmail

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/api/gmail/state` | — | `{ state: GmailState; email?; progress?: { done; total }; newCount?; firstShops?: string[]; lastCheckedAt? }` | — |
| POST | `/api/gmail/connect` | — | `{ authUrl }` (incremental scope `gmail.readonly`, `prompt=consent`, `access_type=offline`) | `GMAIL_DISABLED` |
| GET | `/api/gmail/callback` **public** (OAuth) | `code, state` | 302 → `/add` | — |
| POST | `/api/gmail/scan` | — | `{ state: 'scanning' }` | `GMAIL_REVOKED` |
| GET | `/api/gmail/invoices` | — | `{ email; checkedAt; items: { messageId; shop; summary; local; amountUsd6; date; status: 'new' \| 'added' \| 'not_product' }[] }` | — |
| POST | `/api/gmail/invoices/match` | `{ messageIds: string[] }` + Idempotency-Key | `{ purchaseIds: string[] }` | `VALIDATION` |
| DELETE | `/api/gmail` | — | `204` (revokes the token at Google, deletes it) | — |

### Jars and buying

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/api/jars` | — | `{ jars: { assetId; name; role; amountUsd6; readyMinUsd6; state: JarState /* docs/04 §4: filling, ready, approved, buying, returning, paused, fees_high, no_venue */; price?: Price; note? }[]; nextReminderAt; estFeesUsd6 }` | — |
| POST | `/api/jars/:assetId/cancel` | — | `{ action: SignableAction }` | — |
| GET | `/api/buys/review?include=ready\|all` | — | `{ quoteId; expiresAt /* +30 s */; rows: { assetId; name; amountUsd6; token; chain; venue; price: Price; refPriceUsd6; estQty: string; maxPriceUsd6; fees: Fees; selectable: boolean; reason?: 'fees_high' \| 'price_off_reference' \| 'no_venue'; arkiv?: { key; url } /* ownback.asset.v1 read from Arkiv: createdBy+ownedBy writer AND mint = curated mint; omitted if not found */ }[]; totalUsd6; fees: Fees; destination: string; approval: { kind: 'typed_data'; typedData } }` | `NO_READY_JARS` |
| POST | `/api/buys` | `{ quoteId, approval, signature }` + Idempotency-Key | `{ batchIds: string[] }` | `QUOTE_EXPIRED`, `PRICE_MOVED`, `FEES_TOO_HIGH`, `BAD_SIGNATURE`, `KEEPER_DISABLED` |
| POST | `/api/buys/approvals/:hash/cancel` | — | `{ action: SignableAction }` (`cancelApproval`) | — |
| GET | `/api/buys/:batchId` | — | `BuyProgress` (poll every 2 s) | — |

```ts
type BuyProgress = { batchId; status: BuyBatchStatus; startedAt; arcTx?; cctp?: { message?; seconds? }; slow: boolean;
  entries: { assetId; name; status: BuyEntryStatus; quotePriceUsd6; maxPriceUsd6; fillPriceUsd6?; qty?; amountUsd6; spentUsd6?; venueTx? ; note? }[];
  totals?: { boughtUsd6; leftInJarsUsd6; feesUsd6; feesPctBps: number; feesCovered: boolean; slippageBps: number; returnedUsd6 };
  destination: string };
```

### Receipts and activity

| Method | Path | Response |
|---|---|---|
| GET | `/api/receipts?filter=all\|in_jars\|bought\|needs_review&cursor=` | `{ stats: { count; spentUsd6; putToWorkUsd6 }; groups: { month: string; rows: ReceiptRow[] }[]; nextCursor }` |
| GET | `/api/receipts/:id` | `{ receipt; investUsd6; where: { label; detail; amountUsd6; assetIds }[]; proof: ProofTrail; stored: 'fields_only' }` |
| DELETE | `/api/receipts/:id` | `204`: fields wiped, amounts kept for limits |
| DELETE | `/api/receipts` | `204`: same for all |
| GET | `/api/activity?cursor=` | `{ groups: { label: 'Today' \| 'Earlier'; items: { id; kind: EventKind; title; body; link: string; at }[] }[] }` |

`ReceiptRow = { id; shop; item; local; amountUsd6; date; status: 'bought' | 'in_jar' | 'needs_review' | 'fallback'; investUsd6 }`

### Wallet, withdraw, settings

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/api/wallet` | — | `{ vault: { inJarsUsd6; freeUsd6; totalUsd6 }; evmAddress; solAddress; signIn: { kind: 'privy' \| 'seed'; email? } }` | — |
| POST | `/api/withdraw` | `{ amountUsd6, chain }` + Idempotency-Key | `{ withdrawalId; action: SignableAction; feeUsd6; feeCovered: boolean }` | `INSUFFICIENT_FREE`, `CHAIN_UNSUPPORTED`, `NO_SOLANA_RECIPIENT` |
| POST | `/api/withdraw/:id/submitted` | `{ txHash? , challengeIds? }` | `Withdrawal` | `TX_REVERTED` |
| GET | `/api/withdraw/:id` | — | `Withdrawal` (`sending` → `sent`) | — |
| PUT | `/api/notifications` | `{ buyDone; needsReview; nearLimit }` | same | — |
| POST | `/api/push/subscribe` | Push subscription JSON | `204` | — |
| GET | `/api/me/export` | — | JSON file (everything we hold) | — |
| POST | `/api/og/connect` | — | `{ authUrl }` (iAI bonus, flag `OG_SIGNIN`) | `FEATURE_OFF` |

### Asset catalog (curate → propose → promote)

Verified mints only. Pipeline: [database/asset-discovery.md](../database/asset-discovery.md). AI may **propose**; promote requires issuer + index + on-chain evidence (A1).

| Method | Path | Auth | Body / result |
|---|---|---|---|
| GET | `/api/assets` | public | `{ assets: { assetId; name; class; mints[] }[] }` — verified rows from `assets-curated.json` |
| GET | `/api/catalog` | public | Counts + storage map for discovery catalog vs Arkiv |
| GET | `/api/catalog/companies` | public | `?q=&limit=` company rows for Fix-the-match / Confirm |
| GET | `/api/catalog/tokens` | public | `?chain=&issuer=&status=&limit=` long RWA token list |
| GET | `/api/assets/candidates` | public | `{ candidates }` — proposed / verified / promoted |
| POST | `/api/assets/candidates` | cron (`CRON_SECRET`); open when `MOCK_CHAIN=1` | Propose mint `{ assetId, name, class, chain, symbol, mint, issuer, venues?, evidence?, source? }` → `{ candidate, threeSource, promoteReady }` |
| POST | `/api/assets/candidates/:id/verify` | public (rate-limit later) | On-chain decimals → attaches `onchain` evidence |
| POST | `/api/assets/candidates/:id/promote` | cron; open when `MOCK_CHAIN=1` | Three-source gate → curated JSON + Arkiv write |
| POST | `/api/jobs/registry/scrape-xstocks` | cron | Issuer scrape → candidates (issuer evidence only) |

### Public and jobs

| Method | Path | Auth | Does |
|---|---|---|---|
| POST | `/api/share` | session | `{ assetId?, batchId?, showAmounts }` → `{ shareId }` (random 128-bit; revocable with `DELETE /api/share/:shareId`, A13) |
| GET | `/card/[shareId].png` | public | 1200×630 share card; amounts only if `showAmounts` was set for that share |
| GET | `/r/[code]` | public | Shared-link landing page; sets the `ob_ref` cookie |
| POST | `/api/jobs/keeper/run` | `Authorization: Bearer CRON_SECRET` | Execute signed approvals ([keeper-and-jobs.md](keeper-and-jobs.md)) |
| POST | `/api/jobs/buy-reminder` | cron, Sun 04:30 UTC | Push "jars ready · review and buy" |
| POST | `/api/jobs/deposits/forward` | cron / event | Auto-add forwarding + `receiveDeposit` |
| POST | `/api/jobs/gmail/scan` | cron | All connected users, 50 messages each |
| POST | `/api/jobs/prices/refresh` | cron or on demand | Price cache |
| POST | `/api/jobs/rest-pending` | cron, 1st of month | Q7 notifications |
| POST | `/api/jobs/arkiv/refresh` | weekly | Extend Arkiv entities with < 30 days left (A17) |
| POST | `/api/jobs/relay/watch` | every 1 min | Alert on stuck/suspicious relay outflows (A3) |
| POST | `/api/jobs/registry/scrape-xstocks` | cron | See asset catalog above |


## Errors

`packages/shared/errors.ts`. Each code has copy in [frontend/copy-and-errors.md](../frontend/copy-and-errors.md).

| Code | HTTP | Retryable | Meaning |
|---|---|---|---|
| `UNAUTHENTICATED` | 401 | no | No or expired session → Sign in, then return |
| `AUTH_INVALID` | 401 | no | Bad Privy token or signature |
| `NONCE_USED` | 409 | no | Seed login replay |
| `GEO_BLOCKED` | 451 | no | US |
| `VALIDATION` | 400 | no | Body failed zod (details = issues) |
| `NOT_FOUND` | 404 | no | |
| `RATE_LIMITED` | 429 | yes | |
| `UPLOAD_TOO_LARGE` / `UNSUPPORTED_MEDIA` | 413 / 415 | no | |
| `READ_FAILED` | 422 | no | Couldn't read the receipt → CaptureError |
| `NOTHING_TO_BUY` | 409 | no | All assets deselected or untokenized → NoMatch |
| `INSUFFICIENT_FREE` | 409 | no | ConfirmStates 3 |
| `LIMIT_REACHED` | 409 | no | Limit screen |
| `TX_REVERTED` | 409 | yes | ConfirmStates 5 (details.reason = vault error name) |
| `TX_NOT_FOUND` | 409 | yes | Not mined yet; client retries `submitted` |
| `CHALLENGE_FAILED` | 409 | yes | User signing / tx rejected or expired (Privy or legacy Circle) |
| `DEPOSIT_NOT_READY` | 409 | yes | |
| `CHAIN_UNSUPPORTED` | 400 | no | |
| `NO_SOLANA_RECIPIENT` | 409 | no | Run `setSolanaRecipient` (separate from `setRules`, A6) |
| `NO_READY_JARS` | 409 | no | |
| `QUOTE_EXPIRED` | 409 | yes | Re-fetch the review |
| `PRICE_MOVED` | 409 | no | BuyStates 3 (a new price needs a new signature) |
| `FEES_TOO_HIGH` | 409 | no | Fees over the user's cap (details `{ feesUsd6, pctBps, capBps }`) |
| `BAD_SIGNATURE` | 400 | no | BuyApproval signature invalid |
| `APPROVAL_EXPIRED` | 409 | no | Deadline passed; review again |
| `KEEPER_DISABLED` | 503 | yes | Kill switch on |
| `GMAIL_DISABLED` / `GMAIL_REVOKED` | 503 / 409 | no | |
| `FEATURE_OFF` | 404 | no | |
| `UPSTREAM` | 502 | yes | Privy, 0G, Jupiter, Arkiv, Iris/CCTP or RPC failed |
| `INTERNAL` | 500 | yes | |

Vault custom error → API code: `OverMonthlyCap` → `LIMIT_REACHED`; `InsufficientFree` → `INSUFFICIENT_FREE`; `PurchaseUsed` → treat as success (idempotent) and re-read events; `IsPaused` → `KEEPER_DISABLED`; anything else → `TX_REVERTED`. (No `OverAssetCap` — Q1 revised.)
