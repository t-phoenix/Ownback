# Admin desk (proposal)

Status: **proposal, 23 Nov 2026.** Nothing here is built yet. A hidden page for the founder showing every service Ownback depends on: whether it's healthy, how much it's used, what it costs, what Ownback earns, and how to top it up. Each service can be topped up **from the desk itself** (on-chain wallets) or **through a link to its own dashboard** (hosted services). Both live side by side on every card.

## Access

- **URL:** `app.ownback.tech/admin`. No link anywhere in the app, and `noindex`.
- **Who:** the normal Google sign-in (Privy session), then the server checks the user against `ADMIN_USER_IDS` (Privy user ids, comma-separated). Everyone else gets a plain 404, so the page's existence isn't revealed.
- **No new password and no funding keys on the server.** Top-ups are signed by the admin's own wallet (Phantom, Rabby). The server only builds the payment request.
- **Read-only by default.** The only writes are an audit row per admin view and the alert thresholds.
- **Privacy (docs/06):** user data is counts and sums only. No emails, addresses or shop names, same as logs.

## Layout

```
Overview      Users · receipts · buys · volume (today / 7d / 30d) · Ownback earnings · runway warnings
Architecture  The system diagram (docs/architecture.svg) with every node coloured by health; click a node → its card
Services      One card per service (below)
Money         Earnings (fee account), costs by service, net
Alerts        Thresholds and recent alerts (sent as web push to the admin)
```

## Service cards

Every card shows: **status** (live probe), **usage** (from our DB), **cost** (measured where possible, plan price otherwise), **balance and runway** (wallets), and two buttons: **Top up** (if it's a wallet) and **Open dashboard** (the provider's page).

| Service | What it does | Usage (source) | Cost (source) | Balance / top-up | Linked dashboard |
|---|---|---|---|---|---|
| **Solana relay** | Pays SOL gas and new token-account rent for every buy and sell | Txs signed, new token accounts opened (`buy_entries`, on-chain signatures) | SOL spent per day, from the relay's transaction fees and rent (Solana RPC) | SOL balance; runway = balance ÷ 7-day average spend. **Top up:** Solana Pay QR/link to the relay address | Solscan account page |
| **Arc keeper** | Mints "Move to Arc" withdrawals on Arc | Mints sent (`withdrawals`) | USDC gas per receipt (Arc RPC receipts) | USDC gas balance. **Top up:** EIP-681 link / QR (USDC on Arc) | Arc explorer address page |
| **Arkiv writer** | Writes the asset registry and buy proofs | Writes (`arkiv_key` on rows) | Gas per write | Balance. **Top up:** address + QR | Arkiv explorer |
| **0G compute** | Receipt reading and the AI jury (TEE models) | Calls per job and model, success rate, latency (`ai_runs`) | Calls × price per call (configured per model) | Ledger balance via the 0G broker. **Top up:** link (the 0G ledger deposit needs the owner key, which the server doesn't hold) | 0G console |
| **Jupiter** | Quotes, prices, swaps | Quotes / swaps per day, 429 rate (backend counters) | Free (lite API); our platform fee is income, not a cost | — | Jupiter portal (API keys / limits) |
| **Circle CCTP + Iris** | Moves USDC Arc → Solana and back | Bridges, attestation wait time (`buy_batches`, `withdrawals`) | Fee per transfer (from Iris `feeExecuted`) | — | Circle developer console |
| **Privy** | Google sign-in, wallets | Monthly active users (`sessions`) | Plan tier vs MAU | — | Privy dashboard |
| **Neon (Postgres)** | Database | Storage, compute hours (Neon API) | Plan + overage (Neon consumption API) | Billing link | Neon console |
| **Render (API)** | Backend server | Deployed commit (`/api/health`), uptime | Plan price | Billing link | Render dashboard |
| **Vercel (PWA + site)** | Frontend and marketing site | Deploy status | Plan price | Billing link | Vercel dashboard |
| **Share-price feed** | Gap figure on suggestions (display only) | Calls, failure rate | Free today (Yahoo); a keyed feed later (Pyth) | — | — |

## Money

- **Earnings:** the USDC balance of `OWNBACK_FEE_ACCOUNT` (Solana RPC), plus per-buy fee history. Each buy stores its Ownback fee in `buy_entries.fee_usd6` (the column exists; the buy flow needs to write it).
- **Costs:** relay SOL (at the SOL price), keeper gas, Arkiv gas, 0G calls, plus fixed plan prices per month.
- **Net and per-buy economics:** earnings minus variable cost per buy, so the fee level can be set from data.

## Alerts

Thresholds, editable on the desk:

| Alert | Default |
|---|---|
| Relay runway | under 7 days, or under 0.05 SOL |
| Keeper gas | under $0.50 |
| 0G ledger | under 50 calls left |
| Jupiter 429 rate | over 10% in an hour |
| Backend commit | behind the latest `main` for more than 30 min (the Render deploy split) |

Sent as web push to the admin (existing VAPID setup), at most once per alert per 6 hours.

## API (to add to backend/api-contract.md when built)

| Method | Path | Returns |
|---|---|---|
| GET | `/api/admin/overview` | KPIs, earnings, warnings |
| GET | `/api/admin/services` | One card per service: status, usage, cost, balance, runway, links |
| GET | `/api/admin/topup/:service` | Payment request (address, chain, token, suggested amount, Solana Pay / EIP-681 URI) |
| PUT | `/api/admin/alerts` | Alert thresholds |

New env: `ADMIN_USER_IDS`. The fee account and service addresses are already in env.

## Build phases

1. **Wallets and money:** relay, keeper, Arkiv and fee-account balances, runway, top-up QR and links, earnings. Highest value, since the relay balance is the first thing that runs out.
2. **Usage:** counts from our own tables (`ai_runs`, `buy_entries`, `buy_batches`, `withdrawals`, `sessions`) and backend counters for Jupiter calls.
3. **Hosted services:** Neon and Render usage through their APIs (needs read-only API keys, created by a human), with plan prices as config.
4. **Architecture view and alerts.**
