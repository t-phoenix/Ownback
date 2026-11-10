# Overview docs

These docs apply to every part of Ownback. Each part also has its own folder ([contracts](../contracts/), [backend](../backend/), [database](../database/), [frontend](../frontend/)) that goes into detail.

| # | Doc | Answers | Status |
|---|---|---|---|
| 01 | [Product overview](01-product-overview.md) | What we build, for whom, what's in and out, every screen | Ready |
| 02 | [System overview](02-system-overview.md) | The parts, how they talk, the six main flows end to end | Ready |
| 03 | [Decisions and open questions](03-decisions-and-open-questions.md) | The user's answers to Q1–Q8, settled decisions | **Ready** (Q3+Q8 closed 6 Nov evening) |
| 11 | [AI-readiness audit](11-ai-readiness-audit.md) | Conflicts and gaps found on 6 Nov evening, how each was fixed, what's still external | Ready |
| 12 | [Markets](12-markets.md) · [build prompt](12-markets-build-prompt.md) | Direct buy/sell of xStocks with price charts, the faster price layer, wireframes in [markets-wireframes.html](../markets-wireframes.html) | Spec, not built |
| — | [AI build instructions](AI_BUILD.md) | Rules for coding agents (auto-loaded via the root CLAUDE.md / AGENTS.md) | Ready |
| 04 | [State machines](04-state-machines.md) | Every state and transition the frontend and backend must agree on | Ready, becomes `packages/shared/states.ts` |
| 05 | [Gasless and fees](05-gasless-and-fees.md) | Fee simulation, the user's fee cap, who signs and who pays on every chain | Ready, pending spikes S4, S14, S17 |
| 06 | [Security](06-security.md) | Threat model, keys, invariants, privacy, compliance, kill switch | Ready |
| 07 | [Testing and demo](07-testing-and-demo.md) | Test plan per layer, acceptance tests R1–R19, money budget, stage script | Ready |
| 08 | [Build plan and checklists](08-build-plan-and-checklists.md) | Accounts and secrets, spikes, phases, integration checkpoints, go/no-go | Ready |
| 09 | [Submission pack](09-submission-pack.md) | What each prize needs, README outline, video script, final checklist | Ready |
| 10 | [Security audit](10-security-audit.md) | 26 design-stage findings (attack → fix), the guarantees that remain | Ready |

How the 15 docs from the architecture doc's list map to files:

| Architecture list | Where it is now |
|---|---|
| 1 Spike results | [08-build-plan-and-checklists.md § Spikes](08-build-plan-and-checklists.md#spikes) (fill in the results there) |
| 2 Chain config | [contracts/chain-config.md](../contracts/chain-config.md) (public addresses verified from 3 sources on 6 Nov) |
| 3 State machines | [04-state-machines.md](04-state-machines.md) |
| 4 Vault contract spec | [contracts/vault-spec.md](../contracts/vault-spec.md) |
| 5 API contract | [backend/api-contract.md](../backend/api-contract.md) |
| 6 Database schema | [database/schema.md](../database/schema.md) |
| 7 AI spec and test set | [backend/ai-spec.md](../backend/ai-spec.md) |
| 8 Registry seed data | [database/registry-seed.md](../database/registry-seed.md) |
| 9 Arkiv schema | [database/arkiv-schema.md](../database/arkiv-schema.md) |
| 10 Gas and fee policy | [05-gasless-and-fees.md](05-gasless-and-fees.md) |
| 11 Copy and error catalog | [frontend/copy-and-errors.md](../frontend/copy-and-errors.md) |
| 12 Design tokens | [frontend/design-tokens.md](../frontend/design-tokens.md) (Logo C, Ledger Green, Bricolage) |
| 13 Test and demo plan | [07-testing-and-demo.md](07-testing-and-demo.md) plus each folder's testing doc |
| 14 Accounts and secrets checklist | [08-build-plan-and-checklists.md § Accounts and secrets](08-build-plan-and-checklists.md#accounts-and-secrets) |
| 15 Submission pack | [09-submission-pack.md](09-submission-pack.md) |
