# 10 · Security audit (design stage)

**Audit of:** every doc in this repo, the PRD, the architecture doc and the wireframes, read as an attacker before any code exists.
**Date:** 6 Nov.
**Method:** for each asset (users' USDC, shares, keys, data, sponsor budgets, the registry), list who can touch it, then try to break each step of every flow in [02](02-system-overview.md).

**Severity scale:**
- **Critical**: user funds can be stolen.
- **High**: funds lost or misdirected under realistic conditions, or private data exposed.
- **Medium**: money or trust harmed with effort or bad luck.
- **Low**: hardening.

**Status:** *Fixed in docs* means the design and the relevant docs now include the fix. *Residual* means the risk is accepted, with the reason given.

## Summary

| ID | Finding | Severity | Status |
|---|---|---|---|
| A1 | Arkiv registry spoofing: anyone can write entities with our schema tag, and `changeOwnership` can even hand one to our writer address. A fake `asset` mint would make the keeper buy a scam token | **Critical** | Fixed in docs |
| A2 | The keeper could buy without the user's consent; nothing on-chain required approval | **High** | Fixed in docs (signed BuyApproval, Q7) |
| A3 | Relay custody gap: a compromised backend or relay key can swap a batch to an attacker during the about one-minute window | **High** | Residual, reduced |
| A4 | Manipulated price: the 1% cap is relative to a quote the attacker can move first (thin xStock pools, sandwiching) | **High** | Fixed in docs |
| A5 | Blind signing: Google users approve contract calls the backend built; a compromised backend could change the parameters | **High** | Fixed in docs (bounded) |
| A6 | Solana withdraw recipient lived in `setRules`, so a tampered rules call could redirect future withdrawals | **High** | Fixed in docs |
| A7 | Fees were unbounded and partly unshown (the $0.05 didn't add up) | **Medium** | Fixed in docs (Q2) |
| A8 | Gmail invoice spoofing: a fake "Amazon invoice" email plants purchases or prompt injection | **Medium** | Fixed in docs |
| A9 | AI output could name any company or asset | **Medium** | Fixed in docs |
| A10 | Seed phrase encrypted with a 6-digit PIN can be brute-forced offline if the device storage is copied | **Medium** | Fixed in docs (passkey PRF first) + residual |
| A11 | Stateless 7-day JWT can't be revoked; a stolen cookie keeps working after sign-out | **Medium** | Fixed in docs |
| A12 | Gmail OAuth callback without a bound `state` + PKCE allows login CSRF / account mix-up | **Medium** | Fixed in docs |
| A13 | Share card URL `/card/[id].png` with guessable IDs leaks holdings | **Medium** | Fixed in docs |
| A14 | Deposits on other chains need the user's key to move. Any "auto-move" design risks giving us spending power | **Medium** | Fixed in docs (forwarder, Q3) |
| A15 | Solana deposits for Google users: Circle Solana wallets can't call CCTP, so the money can't leave without a relay hop | **Medium** | Fixed in docs (custody note) |
| A16 | Sponsor drain through mass Google sign-ups (each new wallet gets sponsored gas) | **Medium** | Fixed in docs |
| A17 | Arkiv entity lifetime is at most about 182 days, but docs planned 1–2 years. Registry rows would silently vanish and buys would pause | **Medium** | Fixed in docs |
| A18 | Wrong or unverified contract addresses (pre-filled from memory) | **Medium** | Fixed: verified from 3 sources |
| A19 | BNB venue needs a third-party bridge and non-Circle USDC: new trust and new failure modes | **Medium** | Fixed in docs (gated, capped) |
| A20 | Hosting or DNS takeover serves a malicious PWA that steals seeds | **Medium** | Fixed in docs (2FA, CSP, SRI) |
| A21 | Single-EOA vault owner | **Low** | Fixed in docs (Safe if available on Arc) |
| A22 | Off-chain rule changes (rate, split) by a session thief silently change future purchases | **Low** | Fixed in docs |
| A23 | FX rate source wrong or poisoned → wrong invest amount | **Low** | Fixed in docs |
| A24 | Referral or Sybil abuse | **Low** | Residual (no rewards in MVP) |
| A25 | Issuer freeze of xStocks, or a USDC blocklist on the vault | **Low** | Residual (disclosed) |
| A26 | Circle webhook spoofing (deposit seen) | **Low** | Fixed in docs |

## Findings

### A1 · Arkiv registry spoofing (Critical)

**Attack:**
1. Arkiv queries match any entity with our schema tag. The SDK says `ownedBy` "is a filter, not a security boundary", and `changeOwnership` exists. So an attacker writes `ownback.asset.v1` with `asset_id = "co:apple"` and their own token mint, and transfers ownership to our writer address.
2. A query that only filters `ownedBy(writer)` accepts it.
3. The keeper buys the attacker's token with users' money and sends it to their wallets.

**Fix:**
- Every Arkiv read filters `createdBy(writer)` **and** `ownedBy(writer)`. The creator can't be changed. This is verified in [scripts/arkiv-check.ts](../scripts/arkiv-check.ts).
- **Two-source rule for mints:** a swap only runs if the mint matches both Arkiv and the git-reviewed `packages/shared/assets.ts`. If either differs, the jar is paused (BuyStates 7).
- Schema names are versioned (`ownback.asset.v1`).

**Docs:** [database/arkiv-schema.md](../database/arkiv-schema.md), [backend/keeper-and-jobs.md](../backend/keeper-and-jobs.md).

### A2 · Keeper buys without consent (High)

**Attack:** a leaked Circle entity secret, or a bug, lets the keeper `execute` any ready jar at any time and price.

**Fix (also your Q7 decision):** every buy needs a user-signed EIP-712 **BuyApproval**: assets, amounts, venue, max price, max fee, deadline. The vault checks the signature in `execute`: ERC-1271 for Circle smart accounts, `ecrecover` for seed EOAs. It also caps each item at the approved amount, and an approval can't be reused past its amounts or deadline.

A stolen keeper key can now do nothing on its own.

**Docs:** [contracts/vault-spec.md](../contracts/vault-spec.md), [docs/04](04-state-machines.md).

### A3 · Relay custody gap (High, residual)

**Attack:** between the CCTP mint on Solana and the swap, USDC sits in our relay. Whoever controls the relay key (a backend compromise) can swap it to their own address.

**Reduced by:**
- The window is about 1 minute.
- Each batch is limited to the approved amounts, and `maxBatchUsd6` caps it further.
- A watcher alerts on any relay outflow to an address that isn't a user ATA or the vault.
- The key holds only dust SOL and lives only in Vercel env.
- Proofs on Arkiv make any theft public.

**Why it's residual:** removing the gap needs a Solana program that swaps and forces the destination. That's the post-hackathon fix, said honestly in the README.

### A4 · Manipulated price (High)

**Attack:** xStock pools are thin. An attacker pushes the pool price up, our quote reads the inflated price, and the "+1%" cap still lets us buy high. Then they sell into us (a sandwich).

**Fix:**
1. A **reference price check**: the pool quote must be within 2% of an independent reference (Pyth price feed for the underlying, or Jupiter's price API across all pools). Otherwise the jar waits.
2. Swaps are sent with MEV protection (Jupiter's protected send or a Jito bundle) and dynamic slippage capped at 1%.
3. Large orders are split.
4. The fill price is checked against the max **after** the swap, by reading the balance change. Any breach raises an alert and pauses that asset.

**Docs:** [backend/keeper-and-jobs.md](../backend/keeper-and-jobs.md), [backend/integrations.md](../backend/integrations.md).

### A5 · Blind signing (High → bounded)

**Attack:** the backend builds the parameters of `allocate`, `setRules` and BuyApprovals, and Circle's approval sheet may not show them in a readable form. A compromised backend could send the user's jar money into the wrong asset.

**Fix:**
1. The PWA decodes every `SignableAction` itself, using the shared ABI, and shows the real assets and amounts before opening Circle's sheet. If they differ from the purchase, the PWA refuses.
2. BuyApprovals are EIP-712 typed data, so Circle's sheet shows the fields.
3. Above all, the vault's hard rules bound the damage. Even a fully compromised backend can't:
   - send free or jar money to an address it controls (recipients are fixed, relays are timelocked)
   - buy without a user signature
   - exceed the limits

**Residual:** the A3 window.

### A6 · Withdraw recipient tampering (High)

**Attack:** `solanaRecipient` lived inside `setRules`. A tampered rules transaction (see A5) could point future Solana withdrawals at an attacker.

**Fix:**
- `setSolanaRecipient` is a separate function.
- The first value is immediate. Any later change waits 48 hours, emits an event, and triggers a push ("Your Solana withdraw address will change on …").
- The PWA checks the value equals the ATA derived from the user's own Solana address.

### A7 · Fees unbounded or unclear (Medium)

**Fix (your Q2 decision):**
- Every money move is **simulated** first: EVM `simulateContract`/`estimateGas`, Solana `simulateTransaction`, CCTP/Gateway fee quotes, and the Jupiter quote.
- The total fee is shown in dollars and as a % of the amount.
- Each user sets a **max fee %** (default 5% of the amount being invested).
- Automatic steps that would exceed it don't run. User actions above it are blocked, with a link to change the limit.
- The cap is inside the signed BuyApproval.
- If a later step's fresh simulation exceeds the cap mid-pipeline, the remaining steps stop and the money goes back to the jar. We pay for that return.

**Docs:** [05](05-gasless-and-fees.md).

### A8 · Gmail invoice spoofing (Medium)

**Attack:** an email with a forged `From: Amazon` plants fake invoices or prompt injection.

**Fix:**
- Only messages whose `Authentication-Results` header shows DKIM **pass** for the shop's domain are read.
- Bodies are treated as data (prompt-injection rules in [backend/ai-spec.md](../backend/ai-spec.md)).
- Nothing moves money without the user's Confirm.

### A9 · AI names any asset (Medium)

**Fix:**
- `find_maker` may only return `companyId` values that exist in the registry (A1 rules). Anything else counts as "not listed".
- Assets come from the registry, never from model text.
- Amounts come from code, never from the model.

### A10 · Seed phrase at rest (Medium, residual)

**Fix:**
- Prefer a **passkey with the WebAuthn PRF extension** to derive the encryption key (hardware-backed, can't be brute-forced).
- Fall back to a PIN of at least 6 digits with PBKDF2-SHA256 at 600k iterations, and tell the user that their written words are the real backup.

**Residual:** malware on an unlocked phone can still read the words when they're used. This is disclosed on the Seed phrase screen.

### A11 · Sessions can't be revoked (Medium)

**Fix:**
- Server-side `sessions` table, with the cookie holding an opaque random ID.
- 24-hour sliding expiry, 7 days maximum.
- Sign-out and "sign out everywhere" delete the rows.

**Docs:** [database/schema.md](../database/schema.md).

### A12 · Gmail OAuth CSRF (Medium)

**Fix:**
- `state` = an HMAC of the session ID and a nonce, plus PKCE.
- The callback rejects a mismatch.
- The granted Google account must equal the session's Google account, or be explicitly confirmed for seed users.

### A13 · Share card leakage (Medium)

**Fix:**
- Cards use a random 128-bit share ID, created only when the user taps Share. It can be revoked.
- Amounts are hidden unless the owner turned them on for that card.
- The card shows the first name only.

### A14 · Moving deposits without keys (Medium)

**Fix (your Q3, see [03](03-decisions-and-open-questions.md)):** a one-time **auto-add permission**. The user approves an `OwnbackDepositForwarder` on Base, Ethereum and Arbitrum, up to a cap they choose.
- The forwarder can only burn USDC through CCTP to the user's **own** vault balance on Arc. The vault checks the source forwarder and credits the user named in the message.
- Only our relayer can call it, so nobody can grief users' fee budgets.
- The CCTP fee is capped at 0.1%.

Worst case, a compromised relayer moves a user's own USDC into that user's own vault. That's harmless, because they can withdraw.

### A15 · Solana deposits for Google users (Medium)

**Issue:** Circle's Solana wallets can make token transfers but can't call programs, so they can't burn through CCTP or deposit to Gateway.

**Fix:**
- Recommend Arc, Base, Ethereum or Arbitrum for deposits.
- A Solana deposit is one tap: an SPL transfer to our Solana deposit account. The backend then sends it by CCTP to the vault with `hookData = user`, and it's credited by the same `receiveDeposit` path.
- That's custody for about a minute, so it's capped at $500 per deposit and logged on-chain.

Seed-phrase users burn directly from their own wallet, with no hop.

### A16 · Sponsor drain (Medium)

**Fix:**
- Gas Station policy: allowlisted contracts only, a per-wallet daily cap, a global daily cap, and sign-up rate limits (per IP and per device).
- A wallet's gas is sponsored only after its first deposit of ≥ $1. A new Google account costs us nothing until it deposits.

### A17 · Arkiv lifetimes (Medium)

**Fix:**
- Every entity uses `ExpirationTime.fromDays(≤ 180)`.
- A weekly `arkiv:refresh` job extends any registry entity with **under** 30 days left.
- Proof entities are extended while the asset is held. The underlying tx hashes are on-chain forever anyway.
- If an `asset` entity is missing, the jar pauses. It's never treated as "any mint is fine".

### A18 · Wrong contract addresses (Medium)

**Fix:** every public address in [contracts/chain-config.md](../contracts/chain-config.md) is now checked against three sources:
1. Circle's or Arc's docs
2. Explorers and CoinGecko
3. The chain itself: we read `symbol()`, `decimals()`, `localDomain()` and code presence on 6 Nov

The app still asserts `verified = true` at start-up, and a CI script re-reads them on-chain.

### A19 · BNB venue risk (Medium)

**Issue:** CCTP, Gateway and Circle-issued USDC don't exist on BNB Chain (USDC isn't listed there by Circle or CoinGecko). Reaching it needs a third-party bridge and a different dollar token.

**Fix:**
- BNB stays behind the `VENUE_BNB` flag. Its route only runs if its all-in cost beats other venues and fits the fee cap.
- The bridge amount is capped per transfer and per day.
- Only bridges with a published audit and their own on-chain messaging are allowed.
- Money that can't complete returns to the jar.

**Docs:** [03 Q5](03-decisions-and-open-questions.md).

### A20 · Frontend supply chain (Medium)

**Fix:**
- 2FA on Vercel, GitHub, Circle, Google Cloud, Neon and the domain registrar.
- Protected production deploys.
- Strict CSP, plus SRI on any third-party script.
- No third-party analytics.
- Lockfile and frozen installs.

### A21 · Owner key (Low)

**Fix:** a 2-of-3 Safe as vault owner if Safe is deployed on Arc mainnet (spike S16). Otherwise a hardware EOA, moved to a Safe before launch. The owner still can't move user funds.

### A22 · Silent rule changes (Low)

**Fix:** any change to rate, split, limits, fee cap or fallback writes an Activity event and sends a push ("Your rules changed").

### A23 · FX sanity (Low)

**Fix:** reject a rate that differs more than 10% from the previous stored rate for that currency. Show the rate on Confirm (already in the wireframe).

### A24–A26

- **A24:** no referral rewards in the MVP, so nothing to farm.
- **A25:** disclosed on Holding and in Risks.
- **A26:** verify Circle webhook signatures. A webhook only *hints*: state changes still come from reading the chain.

## What the design guarantees after these fixes

| # | Guarantee | Enforced by |
|---|---|---|
| G1 | Nobody but the user can move their free balance, and only to their own address | Vault (`msg.sender`, fixed recipients, 48 h Solana recipient change) |
| G2 | No buy happens without a fresh user signature naming the asset, amount, max price and max fee | Vault (`BuyApproval` check) + keeper |
| G3 | Jar money leaves Arc only to a relay set at least 48 h earlier | Vault timelock |
| G4 | Shares go only to the user's own address | Keeper + relay (off-chain; A3 residual), publicly checkable in proofs |
| G5 | We only buy tokens whose mint matches two independent sources | Keeper (Arkiv `createdBy`+`ownedBy` + git-pinned list) |
| G6 | Fees never exceed the user's cap without them seeing it first | Simulation + BuyApproval |
| G7 | No receipt image, email body or personal data is stored or made public | Backend + Arkiv schema |

## Re-audit triggers

Re-run this audit if any of these change:
- the vault ABI
- a new venue or bridge
- a new signer or key
- a new external data source in the money path
- any change to Arkiv read rules

Before the post-hackathon launch, get an external audit of the vault and forwarder, and of the Solana program that closes A3.
