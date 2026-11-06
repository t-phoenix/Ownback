# Data privacy and security

App-wide view: [docs/06-security.md](../docs/06-security.md). This doc covers the data itself.

## What we keep, and for how long

| Data | Where | Kept | Deleted by "Delete all receipt data"? |
|---|---|---|---|
| Receipt image, audio, email body | Nowhere: memory only, sent to 0G in private mode | Never stored | n/a |
| Shop, place, items, Gmail message ID, summary | `purchases`, `gmail_messages` | Until the user deletes them | **Yes**, wiped to NULL |
| Amounts, FX rate, date, status | `purchases` | Account lifetime (needed for monthly limits and Holdings) | No |
| Allocations, buys, proofs | `allocations`, `buy_entries`, Arkiv `proof` | Account lifetime; Arkiv proofs expire after 2 years | No (no personal data in them) |
| Email | `users` | Account lifetime | No (delete the account for that) |
| Gmail refresh token | `gmail_connections` (encrypted) | Until disconnect or revoke | Disconnect deletes it and revokes it at Google |
| 0G request IDs | `ai_runs` | Account lifetime | No (an ID only) |
| Events | `events` | 180 days | Text with shop names is wiped |
| Seed phrase | The user's device only (IndexedDB, encrypted) | Until the user clears the app | n/a |

## Export ("Download my data")

`GET /api/me/export` returns one JSON file with: user, rules, purchases, allocations, deposits, buys, withdrawals, Gmail message list (no bodies), events. It's generated on request and never cached.

## Delete

- **One receipt** (`DELETE /api/receipts/:id`): wipes shop, place, items and the Gmail ID on that purchase and its events. Keeps the amounts.
- **All receipt data** (`DELETE /api/receipts`): the same for every purchase, plus deletes `gmail_messages`.
- **Account** (post-hackathon): delete every row; the on-chain balances stay the user's (they withdraw first).

## Access

| Who | Access |
|---|---|
| App (Vercel) | One Neon role with read/write on app tables only |
| Team | Neon console, `dev` branch for day-to-day; `demo` branch read-only except for migrations |
| Nobody | No public Data API, no direct DB access from the browser |

## Security checklist

| ✓ | Item |
|---|---|
| ☐ | TLS required on the Neon connection (`sslmode=require`) |
| ☐ | Gmail tokens encrypted with AES-256-GCM; the key only in env |
| ☐ | No PII in logs, in Arkiv, or in share cards (random share IDs, amounts hidden by default, never an address) |
| ☐ | Sessions stored server-side and revocable (A11) |
| ☐ | Every query filtered by `user_id` from the session |
| ☐ | `pnpm check:privacy` script: scans the DB for columns holding base64 images or long email-like text, and scans the Arkiv entities we wrote for `0x…` / base58 address patterns or `@` |
| ☐ | Backups: Neon point-in-time restore on (default); before each migration on `demo`, create a branch |
