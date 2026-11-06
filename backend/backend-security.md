# Backend security

App-wide threat model: [docs/06-security.md](../docs/06-security.md). This is the backend checklist. Tick each item before Sat 03:00.

## Auth and sessions

| ✓ | Item |
|---|---|
| ☐ | Google: verify the Circle `userToken` server-side by calling Circle as that user, then match the Circle user ID to our user. Never trust an email or address sent by the client |
| ☐ | Seed: one-time nonce (5 min expiry, stored, deleted on use); message includes domain, nonce and timestamp; verify **both** the EVM (EIP-191) and Solana (ed25519) signatures (D16) |
| ☐ | Session: opaque random ID in the `ob_session` cookie → `sessions` table (24 h sliding, 7 days max), rotated at sign-in; sign-out (and "everywhere") deletes rows (A11) |
| ☐ | Gmail OAuth: `state` = HMAC(session, nonce) + PKCE; reject a mismatch (A12) |
| ☐ | CSRF double-submit on every non-GET route |
| ☐ | Every query is scoped by `session.userId`. No route takes a user ID from the client |
| ☐ | Geo-block US at the edge middleware (`x-vercel-ip-country`), returning `GEO_BLOCKED` |

## Input validation

| ✓ | Item |
|---|---|
| ☐ | Every body, query and param parsed with the zod schema from `packages/shared/api.ts`; anything unknown is rejected |
| ☐ | Uploads: max 8 MB; image types checked by magic bytes (JPEG, PNG, HEIC, WebP); audio ≤ 30 s; kept in memory only, never written to disk |
| ☐ | AI outputs parsed with zod and re-checked by code ([ai-spec.md](ai-spec.md)) |
| ☐ | Gmail bodies truncated to 12k characters and HTML stripped before 0G |
| ☐ | Tx hashes from the client are only used to *look up* receipts; state changes come from on-chain events |
| ☐ | Addresses checksummed (EVM) and validated as base58 (Solana) |

## Money paths

| ✓ | Item |
|---|---|
| ☐ | Idempotency keys stored for 24 h on confirm, buys, withdraw and Gmail match |
| ☐ | Confirm builds `allocate` from the **stored** purchase allocations, not from client amounts |
| ☐ | Every `SignableAction` includes `expect` (assets, amounts) so the PWA can decode and refuse a mismatch (A5) |
| ☐ | BuyApproval signatures verified server-side before storing; the keeper only sends orders with stored, unexpired approvals |
| ☐ | Fees simulated before every money move; over the user's cap → don't send (Q2) |
| ☐ | Arkiv reads use `createdBy`+`ownedBy` our writer; mints must match `assets.ts` too (A1) |
| ☐ | Reference price check (≤ 2%) and MEV-protected send for every swap (A4) |
| ☐ | Gmail: DKIM pass required (A8) |
| ☐ | Share cards by random share ID only (A13) |
| ☐ | Withdraw recipient is never taken from the client: the vault decides it (D11) |
| ☐ | The keeper checks the swap output mint against Arkiv and the destination against the users table, every time |
| ☐ | The keeper is behind the `KEEPER_ENABLED` flag + `CRON_SECRET`; "Buy now" only includes the session user's jars |
| ☐ | `MAX_BATCH_USD6` checked in the keeper as well as in the vault |

## Secrets

| ✓ | Item |
|---|---|
| ☐ | Secrets only in Vercel env; none prefixed `NEXT_PUBLIC_` except `CIRCLE_APP_ID`, `GOOGLE_CLIENT_ID` and `VAPID_PUBLIC` |
| ☐ | Gmail refresh tokens encrypted with AES-256-GCM (`TOKEN_ENC_KEY`), random 12-byte IV per token |
| ☐ | Circle entity secret ciphertext generated per request, as the SDK does |
| ☐ | `gitleaks detect` passes in CI |

## Rate limits (per user, in Postgres or Upstash; whatever is quickest)

| Route | Limit |
|---|---|
| `POST /api/purchases` | 30 / hour |
| `POST /api/gmail/scan` | 6 / hour |
| `POST /api/buys` | 5 / hour |
| `POST /api/withdraw` | 10 / hour |
| `GET /api/deposits/watch` | 30 / min |
| Auth routes | 10 / min per IP |

## Logging

- Log: request ID, route, user ID, status, latency, error code.
- Never log: email, wallet addresses, shop or item names, amounts, tokens, signatures, 0G inputs or outputs, Gmail content.
- The keeper may log batch IDs, tx hashes and totals; tx hashes are public anyway.

## Dependencies

- Pin versions.
- Lockfile committed.
- `pnpm audit --prod`: no criticals.
- Only official SDKs: `@circle-fin/*`, `openai`, `@arkiv-network/sdk`, `viem`, `@solana/web3.js`, `googleapis`, `web-push`, `drizzle-orm`.
