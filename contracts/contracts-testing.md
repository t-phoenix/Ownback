# Contract tests

Write and run these in Arc Studio first (Arc prize rule), then keep them in Foundry. `forge test` must pass before deploy and on every change.

## Unit tests (`test/OwnbackVault.t.sol`)

| # | Test | Expect |
|---|---|---|
| U1 | `setRules` with rate 199 or 1001 | `RateOutOfBounds` |
| U2 | `setRules` with cap 0 or maxPerAsset 0 / 10001 | `InvalidRules` |
| U3 | `allocate` before `setRules` | `RulesNotSet` |
| U4 | `deposit` → `free` and `totalAccounted` up by the amount | Pass |
| U5 | `allocate` the wireframe example: $47.75 across 6 assets (33.43, 3.18, 3.18, 3.19, 2.39, 2.38) | Jars match; `free` down by 47.75 |
| U6 | `allocate` over the monthly cap ($45 used of $50, then $47.75) | `OverMonthlyCap(5e6)` |
| U7 | `allocate` over the per-asset cap (Q1 meaning) | `OverAssetCap` |
| U8 | Same `purchaseId` twice for one user | `PurchaseUsed` |
| U9 | Same `purchaseId` from two different users | Both pass (key includes user) |
| U10 | Unsorted or duplicate assets | `AssetsNotSorted` |
| U11 | Allocate more than `free` | `InsufficientFree` |
| U12 | `depositAndAllocate` with free = 35.40 and deposit 12.35 → allocate 47.75 | Pass |
| U13 | Month rollover: allocate at the cap on 30 Nov 23:59 UTC, warp to 1 Dec 00:00 → allocate again | Pass |
| U14 | `MonthIndex.of` against known dates (leap years, 31 Dec → 1 Jan) | Matches |
| U15 | `cancelJar` → free up, jar 0, monthly spent unchanged | Pass |
| U16 | `withdraw` pays `msg.sender` only; another user can't withdraw someone's free balance | Pass / underflow revert |
| U17 | `withdrawCrossChain` to domain 5 without `solanaRecipient` | `NoSolanaRecipient` |
| U18 | `withdrawCrossChain` to domain 26 or 99 | `UnsupportedDomain` |
| U19 | `withdrawCrossChain` calls `depositForBurn` with recipient = sender (EVM) or `solanaRecipient` (mock messenger records args) | Args match |
| U20 | `execute` by non-keeper | `NotKeeper` |
| U21 | `execute` a $3 item with a valid approval (Q7: no minimum) | Pass |
| U22 | `execute` entry above the jar | `OverJar` |
| U23 | `execute` same `batchId` twice | `BatchUsed` |
| U24 | `execute` to a domain with no relay | `UnknownRelay` |
| U25 | `execute` total above `maxBatchUsd6` | `OverBatchCap` |
| U26 | `execute` burns the exact total to `relay[domain]`, emits `Executed` per entry (with approval hash, max price, max fee) and `BatchSent` | Pass |
| U35 | `execute` without a signature, with a wrong signer, or a signature for another vault/chain (EIP-712 domain) | `BadSignature` |
| U36 | `execute` after the deadline / after `cancelApproval` | `ApprovalExpired` / `ApprovalCancelledErr` |
| U37 | Two batches together exceed an approval item's amount | `OverApproval(i)` |
| U38 | Item domain ≠ batch domain | `WrongDomain` |
| U39 | ERC-1271 smart account (mock) signature accepted; a mock returning the wrong magic value rejected | Pass / `BadSignature` |
| U40 | Per-asset cap: fallback asset exempt; another asset over the cap reverts with `OverAssetCap(remaining)` | Pass |
| U41 | `setSolanaRecipient`: first set is immediate; a change needs 48 h; `activateSolanaRecipient` early reverts | Pass / `TimelockNotReady` |
| U42 | `withdrawCrossChain` with `maxFee` > 0.1% | `FeeTooHigh` |
| U43 | `receiveDeposit` from a registered forwarder credits `amount − feeExecuted` to the hookData user | Pass |
| U44 | `receiveDeposit` from an unknown sender / wrong mintRecipient / balance mismatch | `UnknownForwarder` / `BadDeposit` |
| U45 | Forwarder: non-relayer `forward` reverts; fee > 0.1% reverts; burn args are (26, vault, vault, hookData = user) | Pass |
| U46 | `pause` doesn't block `receiveDeposit` or `cancelApproval` | Pass |
| U27 | `returnToJar` without surplus USDC in the vault | `NoSurplus` |
| U28 | `returnToJar` more than executed for (batch, user, asset) | `OverExecuted` |
| U29 | `returnToJar` after a mock CCTP mint back | Jar restored; `totalAccounted` restored |
| U30 | `pause` blocks allocate/execute; withdraw, cancelJar, returnToJar still work | Pass |
| U31 | `activateRelay` before 48 h | `TimelockNotReady`; at 48 h it passes |
| U32 | `activateKeeper` before 48 h | `TimelockNotReady` |
| U33 | Owner functions from non-owner | `NotOwner` |
| U34 | Two-step ownership: only `pendingOwner` can accept | Pass |

## Fuzz tests

- `allocate` with random arrays, lengths 1–16 and amounts 1..1e12: either reverts with a known error, or `Σjar + free` is unchanged for the user.
- `execute` with random entries: `Σ jar` drops by exactly the burned total.
- `MonthIndex.of(t)` is non-decreasing in `t`, and increases by exactly 1 across each month boundary.

## Invariant tests (`test/Invariants.t.sol`)

A handler drives random users and the keeper through `deposit`, `allocate`, `cancelJar`, `withdraw`, signed `execute`, mint-back, `returnToJar` and `receiveDeposit`. After every call, check I1–I9 from [vault-spec.md](vault-spec.md#invariants). Run with `runs = 256, depth = 64`.

## Fork tests (`test/Fork.t.sol`, Anvil fork of Arc mainnet)

| # | Test |
|---|---|
| F1 | Deploy against real Arc USDC and TokenMessengerV2; `deposit` with a funded whale-impersonated account |
| F2 | `execute` to domain 5 emits the CCTP `DepositForBurn` event with our relay ATA as mintRecipient |
| F3 | `withdrawCrossChain` to Base emits `DepositForBurn` with the user as recipient |
| F5 | Fork of Base: forwarder `depositForBurnWithHook` emits a message with destinationCaller = vault and hookData = user (S17) |
| F4 | Record gas for `allocate` (6 assets) and `execute` (1, 10 and 50 entries) in [vault-spec.md](vault-spec.md) (add a "Gas" section with the numbers) |

## Mainnet smoke (after deploy, real money, small)

1. `setRules` + `deposit($2)` + `allocate` from the team seed wallet.
2. Sign a BuyApproval, `execute` a $5 jar → check the CCTP message on Circle's API → mint on Solana by the backend.
2b. Forwarder: $2 on Base → `forward` → `receiveDeposit` on Arc.
3. `withdraw($1)` on Arc, and `withdrawCrossChain($1)` to Base.

Record every tx hash in `docs/tx-log.md`.
