# Backend

The backend is one Next.js app (`apps/web`) using route handlers on the Node runtime, plus cron-triggered job routes. It holds no user keys. It reads the chain, talks to Circle, 0G, Jupiter, Gmail and Arkiv, and builds actions for the user to sign.

| Doc | What it's for |
|---|---|
| [api-contract.md](api-contract.md) | Every route: request, response, errors, auth, idempotency. **Freezes Fri 01:00** |
| [integrations.md](integrations.md) | How we call each external service, plus its limits and failure handling |
| [keeper-and-jobs.md](keeper-and-jobs.md) | Approved buys step by step (no automatic buys), auto-add deposits, retries, the deposit watcher, the Gmail scan, the price cache |
| [ai-spec.md](ai-spec.md) | 0G models, prompts, output schemas, the 20-receipt test set |
| [backend-security.md](backend-security.md) | Auth, input validation, secrets, rate limits, logging |
| [backend-testing.md](backend-testing.md) | Unit, contract, AI eval and integration tests |

Data lives in [database/](../database/): the Postgres schema, the Arkiv schema and the registry seed.

## Folder layout (in `apps/web`)

```
app/api/…                 route handlers (one folder per route in api-contract.md)
app/api/jobs/…            keeper/run, gmail/scan, prices/refresh, limits/monthly (cron, CRON_SECRET)
app/card/[id]/route.tsx   share card PNG (ImageResponse 1200×630)
app/r/[code]/page.tsx     shared-link landing (public)
lib/circle/               user wallets (challenges), dev wallet (keeper), gas station, gateway, cctp (App Kit)
lib/og/                   0G client, prompts/, schemas (zod)
lib/arkiv/                entity types, reads, writes
lib/venues/               jupiter.ts, base.ts, router.ts (pick venue per asset)
lib/match/                pipeline: brand → maker → suppliers → materials → buyable → split
lib/fx.ts                 Frankfurter, cached per date
lib/chain/                viem clients per chain, Solana connection, event readers
lib/db/                   Drizzle schema + queries
lib/events.ts             write Activity events + push
packages/shared/          (repo root) chains, assets, states, api, errors, money, vault-abi
```

## Env

Names only. Values go in Vercel, and the full list is in [docs/08 § Accounts and secrets](../docs/08-build-plan-and-checklists.md#accounts-and-secrets).

```
CIRCLE_API_KEY CIRCLE_ENTITY_SECRET CIRCLE_APP_ID KEEPER_WALLET_ID KEEPER_ADDRESS
OG_API_KEY
ARKIV_ACCESS_KEY ARKIV_WRITER_KEY ARKIV_WRITER_ADDRESS
GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET
DATABASE_URL
RPC_ARC RPC_BASE RPC_ETHEREUM RPC_ARBITRUM RPC_SOLANA
RELAY_SOL_KEY RELAY_SOL_ADDRESS DEPOSIT_RELAY_SOL_KEY RELAYER_WALLET_IDS KORA_URL
VAULT_ADDRESS
VAPID_PUBLIC VAPID_PRIVATE
SESSION_SECRET TOKEN_ENC_KEY CRON_SECRET
KEEPER_ENABLED GMAIL_ENABLED VENUE_BASE VENUE_ETHEREUM VENUE_ARBITRUM VENUE_BNB OG_SIGNIN MOCK_CHAIN
```
