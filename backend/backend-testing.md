# Backend tests

Tool: Vitest. The command `pnpm test` runs the unit and contract tests; `pnpm eval:ai` and `pnpm smoke:*` are separate because they cost money or credits.

## Unit (no network)

| Area | Cases |
|---|---|
| `money.ts` | Usd6 parse and format; never a float; `formatUsd("47750000") === "$47.75"`; rounding half-up for display only |
| Split | $47.75 at 70/20/10 over 1 + 3 + 2 assets → 33.43 / 3.18, 3.18, 3.19 / 2.39, 2.38 (sums exact); empty groups go to the maker; untokenized maker goes to the fallback; "Maker only" |
| Invest amount | $955.00 × 500 bps = $47.75; $2.63 × 500 = $0.13 (NoMatch example); $60.22 × 500 = $3.01 (Gmail list) |
| FX | ₹79,900 at 83.66 → $955.06, rounded to cents (the wireframe shows $955.00 from a rounded rate; fixtures use the exact stored rate). Weekend date → last business day |
| Limits pre-check | Used $45 of $50, purchase $47.75 → LIMIT_REACHED with left $5.00; partial confirm builds $5.00 of allocations, scaled per asset by largest remainder |
| Ready minimum (Q1) | Split may put $33.43 in Apple; no overflow. Jar < $5 → filling + "Buy now anyway"; ≥ $5 → ready. Fee check still blocks tiny buys when `(fee*10000)/amount > maxFeeBps` |
| Fee cap (Q2) | Fees $0.05 on $43.63 (0.11%) pass; $0.30 on $3.18 (9.4%) blocked at 5%; mid-route spike → stop + return; fee parts sum to the total |
| BuyApproval | Typed data hash matches the vault's `hashApproval`; EOA and ERC-1271 signatures verify; expired or cancelled are rejected |
| Arkiv read guard | A fake entity (another creator, ownership transferred to us) is ignored (A1) |
| State machines | Every allowed transition in [docs/04](../docs/04-state-machines.md) passes; every other one throws |
| Error mapping | Each vault custom error → the API code from [api-contract.md](api-contract.md#errors) |
| Gmail filter | Allowlist query builder; already-seen IDs skipped; `not_product` kept |
| Keeper planning | Only items from signed, unexpired approvals; grouping by venue domain; price impact > 1% or fees over the cap → smaller amount or waiting; batch cap |
| Seed auth | Valid EVM + Solana signatures pass; either one wrong fails; reused nonce fails |

## API contract

For each route in `api.ts`, a test calls the handler with a fixture DB and parses the response with the shared zod schema. The mock layer (MSW) for the frontend is generated from the same schemas, so a contract change breaks both sides at once.

## Integration (mock chain)

`MOCK_CHAIN=1` swaps in fakes for viem/Solana clients, Circle and Jupiter that record the calls. Covered flows:
1. Sign-in (both kinds) → rules → deposit seen → added.
2. Purchase (photo fixture, recorded 0G response) → Confirm → `submitted` with a fake tx whose logs contain `Allocated` → saved.
3. Keeper: jars → execute → attestation → swap ok / swap fail ×2 → returnToJar → events.
4. Withdraw cross-chain → sending → sent.
5. Crash resume: kill the keeper after each step and re-run; no duplicate execute, swap or proof.

### Full workflow harness (launch gate)

With API on `:3001` and `MOCK_CHAIN=1` (API alone is enough — do not start the Next frontend unless you are UI-testing; Privy makes `next dev` heavy on RAM):

```bash
cd backend && npm run db:migrate && npm run smoke:workflow
# optional FE check when next is already up:
# HARNESS_FE_URL=http://127.0.0.1:3000 npm run smoke:workflow
```

[`scripts/workflow-harness.ts`](scripts/workflow-harness.ts) exercises seed auth → onboard once → re-auth still onboarded → Arc deposit funding → typed iPhone purchase (match jury) → confirm → jars → Jupiter review with $0.50 override → buy done → sell → settings edit keeps `onboarded`. Pass = exit 0.

## AI eval

`pnpm eval:ai` over the 20 cases in [ai-spec.md § Test set](ai-spec.md#test-set). Run it on every prompt or model change; the output table is pasted into the PR.

## Mainnet smoke (scripts in `scripts/smoke/`)

| Script | Does | Cost |
|---|---|---|
| `smoke:cctp` | $2 Arc → Solana, then receiveMessage (S1) | $2 (comes back as USDC on Solana) |
| `smoke:swap` | $2 USDC → AAPLx to a test address via Jupiter V2 with a destination account (S3) | $2 |
| `smoke:deposit` | Watcher sees $1 on each chain | $5, withdrawn later |
| `smoke:keeper` | Full run for one test user with one $5 jar (IC4) | $5 |
| `smoke:arkiv` | Write and query each entity type (S11) | Testnet |

Record every result in [docs/08 § Spikes](../docs/08-build-plan-and-checklists.md#spikes).
