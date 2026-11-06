# 06 · Security

This is the app-wide view. **The full attack-by-attack audit is [10-security-audit.md](10-security-audit.md).** Each part has its own checklist:
- [contracts/contracts-security.md](../contracts/contracts-security.md)
- [backend/backend-security.md](../backend/backend-security.md)
- [database/data-privacy-and-security.md](../database/data-privacy-and-security.md)
- [frontend/frontend-security.md](../frontend/frontend-security.md)

## What we promise (and must be able to prove)

1. **Ownback can never move tokens out of a user's wallet.** We never hold user keys: Circle holds them for Google users, and the device holds them for seed users.
2. **Only the user can move their free balance**, and only to their own address (D11).
3. **Jar money moves only with the user's signed BuyApproval**, only to a venue relay set at least 48 hours earlier, and from there only to that user's own address.
6. **Fees never exceed the user's cap without them seeing it first** (default 5%, simulated before every money move).
4. **Receipts, emails and voice are never stored.** Only shop, item, amount and date are kept.
5. **Nothing personal is public.** Arkiv records hold no address, email or shop name.

## Assets worth attacking

| Asset | Where | Worst case |
|---|---|---|
| Users' USDC in the vault | OwnbackVault on Arc | Theft through a contract bug, or a malicious keeper/owner |
| USDC in transit | Relay on Solana/Base, about 1 min per run | Relay key leak → that batch stolen (capped by the batch) |
| Bought shares | Users' own wallets | Swap output sent to the wrong address |
| Gmail refresh tokens | Postgres (encrypted) | Reading users' inboxes |
| Emails and PII | Postgres | Privacy breach |
| Sponsor budgets | Gas Station, Kora, relayer | Drained by spam |
| Arkiv registry | Arkiv entities owned by our writer key | A fake token address → we buy a scam token |

## Trust boundaries

```
[Phone: PWA + seed keys] ──HTTPS + session cookie──► [API on Vercel] ──► Circle · 0G · Jupiter · Gmail · Arkiv · RPCs
         │ Circle Web SDK (keys at Circle)                 │ keeper (Circle dev wallet: execute only)
         ▼                                                ▼
      [Arc: OwnbackVault] ◄── user calls ── user    keeper calls: execute, returnToJar
      Owner (team Safe/EOA): pause, proposeRelay (48 h), setKeeper (48 h)
```

Untrusted inputs:
- receipt images, email bodies and voice (could carry prompt injection)
- 0G outputs
- quotes and token lists from third parties
- anything the client sends (amounts, tx hashes, addresses)

## Threats and controls

| Threat | Control | Owner |
|---|---|---|
| Keeper key misuse | `execute` needs each user's valid BuyApproval signature (A2) and only burns to fixed relays; `returnToJar` ≤ what that batch took. The keeper can't withdraw or touch free balances. The key sits in a Circle developer-controlled wallet | Contracts |
| Registry spoofing on Arkiv | Reads require `createdBy`+`ownedBy` = our writer; mints must also match the git-pinned list (A1) | Backend |
| Price manipulation / sandwich | Reference price check (≤ 2%), signed max price, MEV-protected send, post-swap fill check (A4) | Backend |
| Owner key misuse | Owner can pause allocate/execute but **never** withdraw, cancelJar or user exits. Relay and keeper changes wait 48 h, and events let anyone watch | Contracts |
| Relay key leak | Dust only. The swap happens in the same run, about 1 min. Per-batch cap: `MAX_BATCH_USD6` = $1,000 in the demo. Rotate through the 48-h relay change | Backend |
| Fake or changed token | Every swap checks the output mint against **both** the Arkiv `asset` entry (createdBy+ownedBy our writer) and `packages/shared/assets.ts`. A mismatch pauses that jar (BuyStates 7) | Backend |
| Swap output to the wrong address | The keeper builds the swap with the destination = the user's stored address, read from the vault `Executed` event's user → DB address map. After the swap it reads the user's balance and checks it went up | Backend |
| Prompt injection in receipts or email | AI output is only parsed into zod schemas. It never calls tools that move money. Amounts are re-checked (total > 0, currency known). The user confirms every allocation | Backend |
| Client lies about tx success | The API reads Arc receipts and events itself before changing state | Backend |
| Replay or double confirm | `purchaseId` is unique on-chain. `batchId` is unique on-chain. Idempotency keys on every POST that moves money | Contracts / Backend |
| Seed user registers someone else's Solana address | Login needs signatures from both the EVM and Solana keys (D16) | Backend |
| Session theft | Opaque session ID in an HttpOnly, Secure, SameSite=Lax cookie, backed by a `sessions` table (revocable, 24 h sliding, 7 days max). CSRF token on POSTs. Rule changes notify the user (A11, A22) | Backend / Frontend |
| Gmail token theft | AES-256-GCM encrypted with `TOKEN_ENC_KEY`. Read-only scope. Only messages from the shop sender allowlist are fetched | Backend |
| Sponsor drain | Allowlists and caps ([05-gasless-and-fees.md](05-gasless-and-fees.md#sponsor-limits-so-nobody-can-drain-them-a16)), plus API rate limits | Backend |
| Supply-chain attack on npm | Lockfile committed. `pnpm install --frozen-lockfile`. No postinstall scripts from new deps without review | Everyone |
| XSS → seed theft | Strict CSP. No `dangerouslySetInnerHTML`. Seed encrypted at rest in IndexedDB with WebCrypto AES-GCM, key derived from an app PIN (PBKDF2-SHA256, 600k iterations). Seed screens never log | Frontend |

## Keys and secrets inventory

| Secret | Where it lives | Holds value? | Rotation |
|---|---|---|---|
| Circle API key + entity secret | Vercel env | Controls the keeper dev wallet | Circle console |
| Keeper wallet | Circle developer-controlled (Arc, Base, Ethereum) | Gas only | Change via `setKeeper` (48 h) |
| `RELAY_SOL_KEY` | Vercel env | Dust SOL + in-flight USDC | Change via `proposeRelay` (48 h) |
| `ARKIV_WRITER_KEY` | Vercel env | Testnet only | New key + re-import |
| `OG_API_KEY` | Vercel env | Credits | 0G console |
| Google OAuth secret | Vercel env | Gmail access | Google console |
| `TOKEN_ENC_KEY`, `SESSION_SECRET`, `CRON_SECRET` | Vercel env | — | Redeploy |
| VAPID private key | Vercel env | Push only | Re-subscribe |
| Vault owner | Team hardware wallet (EOA) for the hackathon, a Safe after | Pause + timelocked admin | — |

No secret goes into the repo, `NEXT_PUBLIC_*` variables, logs or Arkiv. `.env.example` lists the names only.

## Privacy rules

- Images and audio go straight to 0G in private mode and are never written to disk or the database. Email bodies are dropped after extraction.
- Stored per purchase: shop, items (names), amount, currency, FX rate, date, 0G request IDs.
- "Download my data" exports everything we hold for the user as JSON. "Delete all receipt data" wipes shop, items and Gmail IDs and keeps only the amounts needed for monthly limits.
- Logs: user ID only. No email, address, shop, amount or token.

## Compliance lines (shown in the app)

- xStocks are not for US persons: geo-block US IP addresses at the edge, and say so in Terms.
- No advice and no promise of returns: the user sets the rule and we execute it. Banned words are listed in [frontend/copy-and-errors.md](../frontend/copy-and-errors.md#banned-words).
- On Holding: "AAPLx is issued by a third party; it tracks Apple stock but is not a share registered in your name."

## Kill switch

If something looks wrong during the demo or after:

1. The owner calls `vault.pause()`. This stops `allocate` and `execute`. Withdrawals and jar cancels still work.
2. Set the `KEEPER_ENABLED=false` env var and redeploy. This stops the cron and Buy now.
3. Pause the Gas Station policy in the Circle console.
4. Show a banner on the app: "Buys are paused while we check something. Your money is safe and you can withdraw any time."
