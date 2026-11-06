# Contract security

App-wide threat model: [docs/06-security.md](../docs/06-security.md). This is the contract part.

## Access control matrix

| Function | User (self) | Keeper | Owner | Anyone | Paused |
|---|---|---|---|---|---|
| setRules, deposit | ✓ | — | — | — | allowed |
| allocate, depositAndAllocate | ✓ | — | — | — | **blocked** |
| cancelJar, withdraw, withdrawCrossChain | ✓ | — | — | — | allowed |
| execute (needs the user's BuyApproval signature) | — | ✓ | — | — | **blocked** |
| cancelApproval, setSolanaRecipient (+48 h for changes) | ✓ | — | — | — | allowed |
| receiveDeposit (only from registered forwarders) | — | — | — | ✓ | allowed |
| forwarder.forward (into the user's own vault only) | — | relayer | — | — | n/a |
| returnToJar | — | ✓ | — | — | allowed |
| pause / unpause | — | — | ✓ | — | — |
| proposeRelay / activateRelay | — | — | ✓ (48 h) | — | — |
| proposeKeeper / activateKeeper | — | — | ✓ (48 h) | — | — |
| transfer / acceptOwnership | — | — | ✓ / pending owner | — | — |

No function lets the owner or keeper send USDC to an address they choose.

## What each role could do if compromised

| Compromised | Worst case | Limit |
|---|---|---|
| Keeper | Nothing without user signatures. With a signature it can only execute what was signed, before its deadline, to the existing relays | Capped per approval item and per batch |
| Relayer (forwarder) | Moves a user's USDC (up to their allowance) into **their own** vault balance | Fee ≤ 0.1%; the user can withdraw |
| Owner | Proposes a malicious relay | 48 h public delay before it's active. Users see `RelayProposed` and can cancel jars and withdraw |
| Relay key | Steals one batch in flight | About 1 min window; capped by `maxBatchUsd6` |
| USDC issuer | Freezes the vault (USDC blocklist) | Out of our control; disclosed in Risks |

## Checklist before deploy

| ✓ | Check |
|---|---|
| ☐ | Solidity 0.8.x pinned, optimizer on, no `unchecked` around money math |
| ☐ | Checks-effects-interactions everywhere; external calls (USDC, TokenMessenger) come after state updates |
| ☐ | `nonReentrant` on deposit, withdraw, withdrawCrossChain, execute, returnToJar (USDC is not a hook token, but the messenger is external) |
| ☐ | `SafeERC20` for transferFrom/transfer/approve; `forceApprove` to the messenger, exact amount |
| ☐ | No `msg.value`, no native balance reads (Arc native USDC uses 18 decimals, ERC-20 uses 6) |
| ☐ | All loops bounded (16 assets, 50 entries) |
| ☐ | `purchaseId` key includes `msg.sender`, so one user can't block another's ID |
| ☐ | No `delegatecall`, no upgrade proxy (the hackathon vault is immutable; a new version is a new address, and users withdraw and redeposit) |
| ☐ | No `selfdestruct`, no `tx.origin` |
| ☐ | EIP-712 domain includes chainId 5042 and the vault address; `SignatureChecker` used (EOA + ERC-1271) |
| ☐ | `receiveDeposit` parses the CCTP V2 message with Circle's library, checks sender, recipient and the balance delta |
| ☐ | Events cover every balance change (the backend mirrors from events) |
| ☐ | Custom errors carry the numbers the UI needs (`OverMonthlyCap(remaining)`) |
| ☐ | Slither run: no high or medium findings left unexplained |
| ☐ | Invariant tests I1–I9 pass at 256 × 64 |
| ☐ | Constructor args double-checked against [chain-config.md](chain-config.md) (USDC, messenger, relays, keeper, owner) |
| ☐ | Source verified on the Arc explorer |

## Known limits (say them in the README)

- `rateBps` is not enforced against the real purchase price. The vault can't see receipts, and it's the user's own money, signed by the user.
- The custody gap: about a minute in the relay per weekly run. Post-hackathon fix: a Solana program that swaps and enforces the destination.
- `cancelJar` doesn't refund the monthly counter. That's deliberate: the limit counts what was set aside.
