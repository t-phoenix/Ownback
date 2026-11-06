# 11 · AI-readiness audit (6 Nov evening)

**Question:** can a coding agent build Ownback from these docs without guessing, and without two docs telling it different things?

**Verdict:** yes for the product meaning and the interfaces between parts, after the fixes below. What still blocks *code that touches real money* is external facts (spike results, token mints, credentials), not ambiguity in the docs. [AI_BUILD.md](AI_BUILD.md) tells agents to use the documented fallback for each of those, behind a flag.

## How it was checked

1. Read every doc, the PRD, the architecture page, the brand kit and both wireframe copies (the local page and the editable canvas).
2. Compared them against the user's decisions in [03](03-decisions-and-open-questions.md), including the Q1 revision: a ready minimum instead of a per-company max.
3. Scripted cross-checks:
   - every API error code has copy
   - every Activity event kind has copy
   - env names match across docs
   - state enums match between [04](04-state-machines.md) and the API
   - no stale terms are left (per-company cap, Sunday auto-buy, `expiresIn`, R1–R16)
   - every relative link and anchor resolves
4. Measured all 36 wireframe screens in a browser for content clipped by the board height.

## What was wrong and what was done

### Conflicts (two sources said different things)

| # | Conflict | Fix |
|---|---|---|
| C1 | docs/03 and AI_BUILD said the wireframes matched the decisions (Q8 done). The editable canvas still showed "Max per company 20%" and "Ready jars buy every Sunday". The local page was updated separately and had gaps: the Buy done title read "Buy now is done", Buy review showed no fee % or limit, Jars had no "Buy now anyway", and Buying states had no "Fees too high" | Fixed those boards. The local page and the canvas are now built from the same 36 board files (canvas v25) |
| C2 | The PRD and architecture page still described a per-company cap (R19, `maxPerAssetBps`), a Sunday auto-buy and "weekly runs". The README told agents to ignore them as stale | Both pages updated and republished. The "stale" warnings were removed from the README and AI_BUILD |
| C3 | The brand kit's sample copy said "Apple buys on Sunday" | Changed to approval-based copy |
| C4 | The split rule said "micro-USDC" in one place and "cents" in another | **D18 clarified:** stored in micro-USDC, but the invest amount and every split row are whole cents, using largest remainder. ai-spec and docs/02 updated |
| C5 | The jar states in the API (6) didn't match docs/04 (8) | The API now imports `JarState` from `states.ts` (docs/04). The rule "never redeclare enums" is in AI_BUILD |
| C6 | The env lists in docs/08 and backend/README disagreed (RPC names, `NEXT_PUBLIC_*`, `VAULT_OWNER`, `ARC_STUDIO_URL`) | backend/README § Env is the complete list (it must equal `.env.example`). docs/08 says who creates each value |
| C7 | The vault spec's `approveBuy` note split the user-functions table in two (the withdraw rows rendered as plain text), and `onchainApproval` wasn't in storage | Table rejoined, storage declared |
| C8 | Leftover stale terms: `remainingForAsset`, "weekly buy done" (Settings toggle), "per weekly run", "R1–R16", the Jars board title "weekly buy" | All replaced |

### Gaps (an agent would have had to guess)

| # | Gap | Now specified in |
|---|---|---|
| G1 | How the server gets the Circle `userToken`, which it needs to build challenges | `x-circle-user-token` header, used per request, never stored ([api-contract § Conventions](../backend/api-contract.md#conventions); frontend-security updated) |
| G2 | A Google user's action may need several challenges (rules, Solana address, approve, action), but the type allowed one | `circle_challenge.challengeIds[]`, run in order; `…/submitted` takes `challengeIds` |
| G3 | When `setSolanaRecipient` and `usdc.approve` happen | Prepended to the first vault action that needs them, in a fixed order; exact-amount approvals only ([api-contract § Signable actions](../backend/api-contract.md#signable-actions)) |
| G4 | Seed users pay Arc gas from their wallet. If every dollar moved into the vault, they couldn't pay gas to withdraw | A $0.10 gas buffer always stays in the wallet ([05](05-gasless-and-fees.md)) |
| G5 | Undefined types: `Withdrawal`, `Eip712`, and where the status enums come from | Defined in [api-contract](../backend/api-contract.md#shared-types); enums imported from `states.ts` |
| G6 | `ChainKey` had no BNB, although BNB is a venue (Q5) | `'bnb'` added for venues and holdings; `DepositChain` excludes it |
| G7 | How a batch fee is shared across items | Pro rata by item amount ([05](05-gasless-and-fees.md), [keeper](../backend/keeper-and-jobs.md)) |
| G8 | How "Save $5.00 now" scales the allocations | Each selected allocation is scaled to the partial total, in whole cents, by largest remainder; the rest goes to `rest_usd6` |
| G9 | The range of the ready minimum | $1–$50, default $5 |
| G10 | 6 error codes and 5 Activity event kinds had no copy | Rows added to [copy-and-errors](../frontend/copy-and-errors.md) |
| G11 | Coding agents had no entry point that loads automatically | Root [CLAUDE.md](../CLAUDE.md) (imports AI_BUILD) and [AGENTS.md](../AGENTS.md) for other tools |
| G12 | Nothing told an agent what to do when something is unclear | AI_BUILD: stop, add the question to docs/03, use the documented fallback, tell the human |
| G13 | 7 wireframe screens clipped their own content (Confirm by 75 px after the fee line was added) | Board heights set to the measured content height |

## Still needed before real-money code (external facts, not ambiguity)

| Item | Where | Agent behaviour until it's filled |
|---|---|---|
| Spikes S1–S10, S12–S20 | [08 § Spikes](08-build-plan-and-checklists.md#spikes) | Build the documented fallback, behind its flag |
| Token mints and decimals for every asset | [chain-config § Assets](../contracts/chain-config.md) | Asset shows "not tokenized yet"; that venue is off |
| Supplier quotes and source URLs (registry) | [registry-seed](../database/registry-seed.md) | The import script refuses rows that still have ☐ |
| 0G model IDs | [ai-spec](../backend/ai-spec.md) (S10) | Use the model class; record the ID when chosen |
| Credentials and accounts | [08 § Accounts](08-build-plan-and-checklists.md#accounts-and-secrets) | Humans only |

## Re-run this audit when

- docs/03 changes
- a frozen interface changes (vault ABI, API, DB, states)
- the wireframes change

Run the stale-term and link checks from step 3 above before every merge to `main`.
