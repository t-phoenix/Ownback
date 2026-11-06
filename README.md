# Ownback

**Own what you buy.** A small share of every purchase (2–10%, default 5%) goes into USDC jars on Arc. When a jar is ready, the user approves the buy, and it buys tokenized shares of the company that made the product, the companies behind it, and the raw materials in it. The buy runs on whichever chain is cheapest all-in. The shares land in the user's own wallet, on mainnet.

ETHGlobal Mumbai · hacking runs Thu 5 Nov 21:00 IST to Sat 7 Nov 09:00 IST · partner prizes: **Arc (Circle) · 0G · Arkiv**

---

## Source of truth

When two documents disagree, the higher one wins. The user's recorded decisions in [docs/03](docs/03-decisions-and-open-questions.md) sit above all of them.

1. **Wireframes**: 36 screens in 7 flows, all in one page: [ownback-wireframes.html](ownback-wireframes.html) (open it in any browser). Editable canvas: https://claude.ai/artifact/J3Y8WWMmWwRXoXKEaJL9aJ
2. **PRD**: https://claude.ai/artifact/CVsUQf22vdpzyfhBMZ4RyJ · local copy: [ownback-prd.html](ownback-prd.html)
3. **Architecture and backend doc**: https://claude.ai/artifact/KeXfMndvPJhL3Eqg5FcEeU · local copy: [ownback-architecture.html](ownback-architecture.html)
4. **The docs in this folder**: they describe how to build what the three documents above describe. If a doc here disagrees with them, the doc is wrong, unless the item is listed in [docs/03-decisions-and-open-questions.md](docs/03-decisions-and-open-questions.md). That file records every conflict found and how it was resolved.

Brand kit (not ranked; it covers only the look; picked: Logo C, Ledger Green, Bricolage): https://claude.ai/artifact/2Uqk914XAsxD7aAconWDqo · local copy: [ownback-brand-kit.html](ownback-brand-kit.html)

## Folder map

| Folder | Holds | Start with |
|---|---|---|
| [docs/](docs/) | Overview docs for everyone: product, system, decisions, state machines, gas, security, testing, build plan, submission | [docs/README.md](docs/README.md) |
| [contracts/](contracts/) | Vault contract spec, chain config, deployment, contract security and tests | [contracts/README.md](contracts/README.md) |
| [backend/](backend/) | API contract, integrations, keeper and jobs, AI spec, backend security and tests | [backend/README.md](backend/README.md) |
| [database/](database/) | Postgres schema, Arkiv schema, registry seed data, data privacy | [database/README.md](database/README.md) |
| [frontend/](frontend/) | Screens and routes, app architecture, copy and errors, design tokens, frontend security and tests | [frontend/README.md](frontend/README.md) |
| [scripts/](scripts/) | Verified helper scripts (Arkiv query check) | [scripts/arkiv-check.ts](scripts/arkiv-check.ts) |

## Reading order

- **Everyone, first 20 minutes:** [docs/01-product-overview.md](docs/01-product-overview.md), [docs/02-system-overview.md](docs/02-system-overview.md), [docs/03-decisions-and-open-questions.md](docs/03-decisions-and-open-questions.md), [docs/04-state-machines.md](docs/04-state-machines.md), [docs/10-security-audit.md](docs/10-security-audit.md).
- **Contracts:** then [contracts/vault-spec.md](contracts/vault-spec.md) and [contracts/chain-config.md](contracts/chain-config.md).
- **Backend:** then [backend/api-contract.md](backend/api-contract.md), [backend/integrations.md](backend/integrations.md), [backend/keeper-and-jobs.md](backend/keeper-and-jobs.md) and [database/schema.md](database/schema.md).
- **Frontend:** then [frontend/screens-and-routes.md](frontend/screens-and-routes.md), [backend/api-contract.md](backend/api-contract.md) and [frontend/copy-and-errors.md](frontend/copy-and-errors.md).
- **Before the demo:** [docs/07-testing-and-demo.md](docs/07-testing-and-demo.md), [docs/08-build-plan-and-checklists.md](docs/08-build-plan-and-checklists.md) and [docs/09-submission-pack.md](docs/09-submission-pack.md).

## Rules every part follows

| Rule | Detail |
|---|---|
| Money is an integer | USDC amounts are counted in micro-USDC (6 decimals) as `bigint`. JSON sends them as strings of digits, never floats. The screen shows dollars to the cent. |
| Dollars everywhere | Local currency appears only on the receipt line. It is converted once, when the receipt is read, and the rate is saved with the purchase. |
| One copy of every shared fact | Chain IDs, addresses, state names, API types, error codes and the vault ABI live in `packages/shared` and are imported, never retyped. |
| Time | Stored in UTC. Shown in the user's local time (IST in the demo). |
| Users hold only USDC | Users never need ETH or SOL. Every fee is simulated, shown in $ and capped (default 5%). See [docs/05-gasless-and-fees.md](docs/05-gasless-and-fees.md). |
| No buy without the user | Every buy needs the user's signed BuyApproval; the vault checks it. |
| No personal data in public | Nothing that identifies a user (email, wallet address, shop name) goes on Arkiv or into logs. |

## Code layout (planned)

```
ownback/                      (this folder)
  apps/web/                   Next.js PWA + API route handlers + keeper/cron routes
  packages/shared/            chains.ts · assets.ts · states.ts · api.ts (zod) · errors.ts · money.ts · vault-abi.ts
  contracts/                  Foundry project (src/, test/, script/) next to the contract docs
  scripts/                    import-registry.ts, spike scripts
  arkiv/                      the five Arkiv prize files
  docs/ frontend/ backend/ database/   these docs (the frontend and backend code lives in apps/web)
```
