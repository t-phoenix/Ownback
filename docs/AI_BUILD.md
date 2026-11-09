# AI build instructions

Read this before writing any Ownback code. It's loaded automatically through the root [CLAUDE.md](../CLAUDE.md) and [AGENTS.md](../AGENTS.md).

## Truth order

When two sources disagree, the higher one wins:

1. **[docs/03 · Decisions](03-decisions-and-open-questions.md)**: the user's decisions.
2. **Screens:** [ownback-wireframes.html](../ownback-wireframes.html) for layout and flow; [frontend/copy-and-errors.md](../frontend/copy-and-errors.md) for the exact words.
3. **PRD and architecture pages**: the product summary.
4. **Folder specs** (`contracts/`, `backend/`, `database/`, `frontend/`, `docs/04–10`): they define every detail the sources above don't. If a folder spec contradicts 1–3, the spec is the bug. Fix the spec in the same PR.

## Never invent

- **Addresses, mints, decimals, or "verified" flags.** Use only values marked ✓ in [contracts/chain-config.md](../contracts/chain-config.md). If a value is ☐, mark the asset `not tokenized yet` or the jar `no_venue`, or turn that venue's flag off.
- **Automatic buys.** Jars never buy without the user signing. Since D29 that signature is the user's own Arc `withdrawCrossChain` plus one Solana swap signature per asset; the server checks the Arc `Withdrawn` event and the exact Solana message it built before acting.
- **A per-company or per-asset cap** (`maxPerAssetBps`, `OverAssetCap`, `capOverflow`). These were removed (Q1). There is no monthly limit either (D32). `readyMinUsd6` is the **jar capacity** (default $5, user range $1–$50): a ready-to-buy helper, never a cap.
- **Float money.** Money is `bigint` micro-USDC (`Usd6` digit strings in JSON). Invest amounts and split rows are whole cents (multiples of `10_000n`), using largest-remainder rounding (D18).
- **Fee comparisons as ratios.** The only fee check is `(feeUsd6 * 10_000n) / amountUsd6 <= maxFeeBps` (docs/05).
- **New enums, error codes, routes or env names.** These live once in `packages/shared` (`states.ts`, `errors.ts`, `api.ts`, `chains.ts`, `assets.ts`). Import them. If you need a new one, add it to the spec first ([docs/04](04-state-machines.md), [backend/api-contract.md](../backend/api-contract.md), [backend/README.md § Env](../backend/README.md#env)), then to the code.

## Rules that are easy to get wrong

| Area | Rule | Spec |
|---|---|---|
| Signing | Every user action goes through one `SignableAction`. Google (Privy) and seed both use `evm_calls` / `sol_tx` / `typed_data`. PWA runs them via Privy or local keys. `circle_challenge` is legacy | [api-contract § Signable actions](../backend/api-contract.md#signable-actions) |
| Before a vault action | The server prepends, only when needed: `setRules` → `setSolanaRecipient(USDC ATA derived from Privy `solAddress`)` → `usdc.approve(vault, exactAmount)` → the action. Never invent ATAs; never store RWA ATAs on the vault | same |
| Auth | Session cookie after `POST /api/auth/privy` or `/api/auth/seed`. No `x-circle-user-token` | [api-contract § Conventions](../backend/api-contract.md#conventions) |
| Trust | The server never trusts a client's "it succeeded". It reads Arc receipts and events before changing state. The PWA decodes every action (`verifyAction`) before the user signs | docs/02, A5 |
| Arc gas buffer | Deposits leave $0.10 USDC in the user's Arc wallet for gas (Google and seed) | [docs/05](05-gasless-and-fees.md) |
| Solana buys | D29: user's Arc USDC → `withdrawCrossChain` → user's Solana USDC ATA → user-signed Jupiter swap with `payer` = relay (relay co-signs, pays gas/rent); never airdrop SOL. Quantity comes from the tx's token balances | docs/05, Q9, docs/03 D29 |
| Arkiv reads | Always `.createdBy(WRITER).ownedBy(WRITER)`. A mint must also match `assets.ts` | [database/arkiv-schema.md](../database/arkiv-schema.md), A1 |
| Keeper | EOA (`KEEPER_*`). Executes only stored, unexpired, signature-checked approvals. Re-simulates before each irreversible step. Anything not bought goes back to the jar (we pay) | [backend/keeper-and-jobs.md](../backend/keeper-and-jobs.md) |
| Privacy | Never store images, audio or email bodies. Never put an address, email or shop name on Arkiv or in logs | [docs/06](06-security.md) |
| Deposits | Arc is the default (D27). EVM auto-add flagged until gas sponsor. Solana deposits are one tap | Q3, Q9 |

## Versions

- `@arkiv-network/sdk` **1.0.1** with `viem` 2.x (verified working: [scripts/arkiv-check.ts](../scripts/arkiv-check.ts)).
- Everything else: the latest stable major at the time you add it. Pin the exact version in the lockfile. Never upgrade a pinned major in a feature PR.
- Arc mainnet chain ID is **5042**. viem exports the chain as `arc`. USDC ERC-20 is `0x3600…0000` (6 decimals; native gas uses 18).

## How to work

1. Read docs/03, docs/04, docs/05 and this file. Then read the folder spec for the part you're building.
2. Build against the shared types, and against mocks (`MOCK_CHAIN=1`, `NEXT_PUBLIC_MOCKS=1`) until the real dependency is ready.
3. A task is done when its tests from the folder testing doc pass and `pnpm check` passes (typecheck, lint, unit tests).
4. **If something is ambiguous, stop. Don't guess.** Add the question to "Still open" in docs/03, build the documented fallback if one exists, and tell the human.
5. Spikes ([docs/08](08-build-plan-and-checklists.md#spikes)): if a spike you depend on has no result, implement only its documented fallback, behind a flag.

## Credentials (humans only)

Agents never create accounts, sign in, or handle real keys. The full list of credentials (Privy, Google OAuth for Gmail, 0G, Arkiv, Neon, Vercel, RPCs, relay/keeper keypairs, VAPID, `SESSION_SECRET`, `TOKEN_ENC_KEY`; Circle Console optional) is in [docs/08 § Accounts](08-build-plan-and-checklists.md#accounts-and-secrets). Env names: [backend/README.md § Env](../backend/README.md#env). Never commit `.env*` files except `.env.example` (names only).
