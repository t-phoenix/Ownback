# OwnbackVault + OwnbackDepositForwarder spec

Status: **draft for freeze at Fri 01:00**. Changes after that need a PR that regenerates `packages/shared/vault-abi.ts` and gets an OK from the backend owner.

This version includes:
- the user's 6 Nov decisions (Q1 revised: no per-asset cap, Q2 fee cap, Q3 auto-add, Q5 venues, Q7 signed approvals)
- the audit fixes A2, A5, A6 and A14 from [docs/10](../docs/10-security-audit.md)

## Units and IDs

| Thing | Type | Rule |
|---|---|---|
| Amounts | `uint256` micro-USDC (6 decimals) | Always the USDC **ERC-20 interface** on Arc (`0x3600…0000`, 6 decimals). Never `msg.value` or native balances: Arc's native gas view of the same balance uses 18 decimals |
| Asset ID | `bytes32` | `keccak256(bytes(slug))`, slug from `packages/shared/assets.ts` (e.g. `co:apple`) |
| Purchase ID | `bytes32` | `keccak256(bytes(purchaseUuid))`; the second part of a split purchase uses `purchaseUuid + ":2"` |
| Batch ID | `bytes32` | `keccak256(bytes("batch:" + batchUuid))` |
| Month | `uint32` | `year * 12 + (month - 1)`, UTC, from `block.timestamp` |
| Domain | `uint32` | CCTP: Ethereum 0, Arbitrum 3, Solana 5, Base 6, Arc 26 (all verified on-chain via `localDomain()`) |

## Roles

| Role | Who | Can |
|---|---|---|
| User | Any address (EOA or Circle SCA) | Own rules, deposit, allocate, cancel own jars, withdraw own free balance to own address, sign BuyApprovals |
| Keeper | Circle developer-controlled wallet | `execute` **only with a valid user BuyApproval**; `returnToJar`; `receiveDeposit` (anyone may call it) |
| Owner | Safe (2-of-3) if available on Arc, else a hardware EOA | `pause`/`unpause`; propose + activate relay, keeper and forwarder (48 h timelock); 2-step ownership. **Cannot move user money** |

## Storage

```solidity
IERC20 public immutable usdc;
ITokenMessengerV2 public immutable tokenMessenger;
IMessageTransmitterV2 public immutable messageTransmitter;
uint256 public immutable maxBatchUsd6;            // demo: 1_000e6
uint256 public constant TIMELOCK = 48 hours;
uint256 public constant MAX_ASSETS_PER_PURCHASE = 16;
uint256 public constant MAX_ITEMS_PER_APPROVAL = 16;
uint256 public constant MAX_ORDERS_PER_BATCH = 50;

struct Rules {
    uint16  rateBps;          // 200..1000; informational on-chain
    uint64  monthlyCap;       // micro-USDC, > 0 — only hard spend ceiling (Q1 revised: no per-asset max)
    bytes32 fallbackAsset;
}

address public owner; address public pendingOwner; address public keeper; bool public paused;
mapping(address => Rules) public rules;
mapping(address => uint256) public free;
mapping(address => mapping(bytes32 => uint256)) public jar;
mapping(address => mapping(uint32 => uint256)) public spentInMonth;
mapping(bytes32 => bool) public usedPurchase;                 // keccak256(abi.encode(user, purchaseId))
mapping(bytes32 => bool) public usedBatch;
mapping(bytes32 => mapping(uint256 => uint256)) public approvalUsed;   // approvalHash → item index → amount executed
mapping(bytes32 => bool) public approvalCancelled;
mapping(bytes32 => bool) public onchainApproval;                // S20 fallback only: approvalHash → approved by approveBuy
mapping(bytes32 => mapping(address => mapping(bytes32 => uint256))) public executedIn; // batch → user → asset
mapping(address => bytes32) public solanaRecipient;           // user's USDC ATA on Solana (A6)
mapping(address => Pending) public pendingSolanaRecipient;
mapping(uint32 => bytes32) public relay;                      // venue domain → CCTP mintRecipient
mapping(uint32 => bytes32) public forwarder;                  // source domain → OwnbackDepositForwarder (bytes32)
mapping(uint32 => bool) public withdrawDomain;                // {0, 3, 5, 6}
struct Pending { bytes32 value; uint64 eta; }
mapping(uint32 => Pending) public pendingRelay; mapping(uint32 => Pending) public pendingForwarder; Pending public pendingKeeper;
uint256 public totalAccounted;                                // Σ free + Σ jar
```

## BuyApproval (EIP-712, Q7 + A2)

```solidity
// domain: { name: "OwnbackVault", version: "1", chainId: 5042, verifyingContract: vault }
// maxPriceUsd6 = max USDC (6 decimals) the user will pay per 1 whole token (10**tokenDecimals raw units).
// tokenDecimals come from packages/shared/assets.ts (never invent). Example: AAPLx 6 decimals → price for 1_000_000 raw units.
struct Item { bytes32 asset; uint256 amount; uint32 domain; uint256 maxPriceUsd6; }
struct BuyApproval { address user; Item[] items; uint256 maxFeeUsd6; uint256 nonce; uint64 deadline; }
```

- The user signs once per Buy review. Circle SCAs sign through Circle's typed-data challenge (verified with **ERC-1271**). Seed EOAs sign locally (`ecrecover`). Use OpenZeppelin `SignatureChecker`.
- `approvalHash = _hashTypedDataV4(hash(BuyApproval))`.
- Each item can be executed up to its `amount` in total, across any number of batches, until `deadline`. The demo deadline is now + 30 min.
- `maxPriceUsd6` and `maxFeeUsd6` can't be checked on Arc, because the swap happens on another chain. They're emitted in `Executed`, so anyone can compare them with the venue tx (G2 in [docs/10](../docs/10-security-audit.md)). The keeper must honour them.
- `cancelApproval(BuyApproval a)`: the user can revoke an unused approval at any time.

## User functions

| Function | Checks | Effects | Event | Paused |
|---|---|---|---|---|
| `setRules(Rules r)` | `200 ≤ rateBps ≤ 1000` · `monthlyCap > 0` · `fallbackAsset ≠ 0` | store | `RulesSet` | allowed |
| `setSolanaRecipient(bytes32 ata)` | `ata ≠ 0` | First time: set now. Later: `pending = {ata, now+48h}` | `SolanaRecipientSet` / `SolanaRecipientProposed` | allowed |
| `activateSolanaRecipient()` | `pending.eta ≤ now` | set | `SolanaRecipientSet` | allowed |
| `deposit(uint256 amount)` | `amount > 0` | `transferFrom` → `free += amount` | `Deposited(user, amount, 26)` | allowed |
| `allocate(bytes32 purchaseId, bytes32[] assets, uint256[] amounts)` | not paused · rules set · lengths equal 1..16 · `assets` strictly ascending · amounts > 0 · purchase unused · `sum ≤ free` · `spentInMonth + sum ≤ monthlyCap` | `free -= sum`, jars +=, `spentInMonth` +=, mark purchase | `Allocated(user, purchaseId, asset, amount)` | **reverts** |
| `depositAndAllocate(uint256 dep, …)` | both | both | both | **reverts** |
| `cancelJar(bytes32 asset)` | `jar > 0` | jar → free (counters not refunded) | `JarCancelled` | allowed |
| `cancelApproval(BuyApproval a)` | `msg.sender == a.user` | `approvalCancelled[hash(a)] = true` | `ApprovalCancelled` | allowed |
| `approveBuy(BuyApproval a)` **(S20 fallback only)** | `msg.sender == a.user` · `deadline ≥ now` · not cancelled | `onchainApproval[hash(a)] = true` | `BuyApproved` | allowed |
| `withdraw(uint256 amount)` | `0 < amount ≤ free` | `free -=`; `transfer(msg.sender)` | `Withdrawn(user, amount, 26, msg.sender)` | allowed |
| `withdrawCrossChain(uint256 amount, uint32 domain, uint256 maxFee)` | `withdrawDomain[domain]` · Solana needs `solanaRecipient[user] ≠ 0` · `maxFee ≤ amount × 10 / 10000` (0.1%) | `free -=`; `depositForBurn(amount, domain, recipient, usdc, 0, maxFee, minFinality)` with recipient = Solana ATA or `bytes32(msg.sender)` | `Withdrawn` | allowed |

**S20:** Prefer EIP-712 + ERC-1271. If Circle SCA cannot sign typed data with arrays on Arc, the PWA builds a `SignableAction` that calls `approveBuy` instead; `execute` then accepts either a valid off-chain signature **or** `onchainApproval[hash]`.

## Keeper functions

```solidity
struct Order { BuyApproval approval; bytes signature; uint256[] itemIndex; uint256[] amounts; }
function execute(bytes32 batchId, uint32 domain, Order[] calldata orders) external onlyKeeper whenNotPaused;
function returnToJar(bytes32 batchId, address user, bytes32 asset, uint256 amount) external onlyKeeper;
function receiveDeposit(bytes calldata message, bytes calldata attestation) external;   // anyone
```

**`execute`**
1. `!usedBatch` · `relay[domain] ≠ 0` · `1 ≤ orders.length ≤ 50`.
2. For each order:
   - `deadline ≥ now`
   - not cancelled
   - `SignatureChecker.isValidSignatureNow(approval.user, approvalHash, signature)` **or** `onchainApproval[approvalHash]` (S20 `approveBuy` fallback)
3. For each `(i, amt)` in the order:
   - `item.domain == domain`
   - `approvalUsed[h][i] + amt ≤ item.amount`
   - `0 < amt ≤ jar[user][item.asset]`

   Then:
   - `jar -= amt`, `approvalUsed += amt`, `executedIn += amt`, `total += amt`
   - emit `Executed(batchId, user, asset, amt, domain, h, item.maxPriceUsd6, approval.maxFeeUsd6)`
4. `total ≤ maxBatchUsd6` → `totalAccounted -= total` → `usedBatch = true` → `forceApprove(tokenMessenger, total)` → `depositForBurn(total, domain, relay[domain], usdc, 0, 0, 2000)` → `BatchSent(batchId, domain, total)`.

There's no on-chain minimum buy size. A $3 jar can be bought if the user signs it, and the fee cap protects them (Q7).

**`returnToJar`**: `amount ≤ executedIn[batch][user][asset]` · `usdc.balanceOf(this) ≥ totalAccounted + amount`. Effects: jar +=, `totalAccounted +=`. Allowed while paused.

**`receiveDeposit` (Q3 auto-add, A14):**
1. Call `messageTransmitter.receiveMessage(message, attestation)`. The vault is the `destinationCaller`, so nobody else can relay these messages.
2. Parse the CCTP V2 message:
   - `sourceDomain` must have `forwarder[sourceDomain] == messageSender` (the burn's message sender)
   - `mintRecipient == address(this)`
   - `user = abi.decode(hookData, (address))`
   - `credited = amount − feeExecuted`
3. Check that the vault's USDC balance went up by exactly `credited`.
4. `free[user] += credited`; `totalAccounted += credited`; emit `Deposited(user, credited, sourceDomain)`.

A message from any other sender reverts. The USDC still mints (to the vault) and becomes surplus that only `returnToJar` could use, and that function is capped by `executedIn`.

## OwnbackDepositForwarder (Base, Ethereum, Arbitrum; same bytecode)

```solidity
contract OwnbackDepositForwarder {
    IERC20 public immutable usdc; ITokenMessengerV2 public immutable tokenMessenger;
    bytes32 public immutable vaultOnArc;          // mintRecipient AND destinationCaller
    address public relayer;                       // Circle dev wallet; change via 48 h timelock by owner
    uint256 public constant MAX_FEE_BPS = 10;     // 0.1%
    function forward(address user, uint256 amount, uint256 maxFee) external onlyRelayer {
        require(amount > 0 && maxFee * 10_000 <= amount * MAX_FEE_BPS);
        usdc.safeTransferFrom(user, address(this), amount);          // needs the user's one-time allowance
        usdc.forceApprove(address(tokenMessenger), amount);
        tokenMessenger.depositForBurnWithHook(amount, 26, vaultOnArc, address(usdc), vaultOnArc, maxFee, 1000, abi.encode(user));
        emit Forwarded(user, amount, maxFee);
    }
}
```

- The user's allowance to the forwarder is their "Auto-add up to $X" setting (default $1,000). It can be revoked any time.
- Worst case, a compromised relayer moves a user's own USDC into that user's own vault balance and pays at most a 0.1% fee.
- `minFinalityThreshold = 1000` is a fast transfer. Check the fee and time in spike S17.

## Owner functions

| Function | Rule |
|---|---|
| `pause()` / `unpause()` | Stops `allocate`, `depositAndAllocate`, `execute`. Never withdraw, cancel, `returnToJar` or `receiveDeposit` |
| `proposeRelay` / `activateRelay`, `proposeForwarder` / `activateForwarder`, `proposeKeeper` / `activateKeeper` | 48 h each |
| `transferOwnership` / `acceptOwnership` | Two-step |

The constructor sets the immutables, owner, keeper, initial relays (5 = Solana relay ATA, 6 = Base relay) and initial forwarders (0, 3, 6 = the EVM forwarders; 5 = our Solana deposit relay, for Google users' one-tap Solana deposits, A15). Initial values don't wait for the timelock. `withdrawDomain` = {0, 3, 5, 6}.

**BNB Chain (Q5):** there's no CCTP domain. Its buys execute to the Base relay (domain 6). The bridge and the swap happen off-chain under the same BuyApproval (`item.domain = 6`, and the venue is shown to the user).

## Views

`currentMonth()` · `remainingThisMonth(user)` · `jarsOf(user, assets[])` · `approvalRemaining(BuyApproval a, uint256 i)` (takes the approval: item amounts aren't stored; 0 if cancelled or expired) · `hashApproval(BuyApproval)` · `domainSeparator()`

## Custom errors

`RateOutOfBounds` · `InvalidRules` · `RulesNotSet` · `ZeroAmount` · `LengthMismatch` · `TooManyItems` · `AssetsNotSorted` · `PurchaseUsed` · `InsufficientFree(uint256)` · `OverMonthlyCap(uint256 remaining)` · `BatchUsed` · `UnknownRelay` · `OverJar` · `OverBatchCap` · `BadSignature` · `ApprovalExpired` · `ApprovalCancelledErr` · `OverApproval(uint256 i)` · `WrongDomain` · `NotKeeper` · `NotOwner` · `IsPaused` · `NoSolanaRecipient` · `UnsupportedDomain` · `FeeTooHigh` · `OverExecuted` · `NoSurplus` · `UnknownForwarder` · `BadDeposit` · `TimelockNotReady` · `NothingPending`

No `OverAssetCap`: per-company max was removed (Q1 revised).

## Events

```solidity
RulesSet(address indexed user, uint16 rateBps, uint64 monthlyCap, bytes32 fallbackAsset)
SolanaRecipientProposed(address indexed user, bytes32 ata, uint64 eta) · SolanaRecipientSet(address indexed user, bytes32 ata)
Deposited(address indexed user, uint256 amount, uint32 sourceDomain)           // 26 for Arc deposits
Allocated(address indexed user, bytes32 indexed purchaseId, bytes32 indexed asset, uint256 amount)
JarCancelled(address indexed user, bytes32 indexed asset, uint256 amount)
ApprovalCancelled(address indexed user, bytes32 indexed approvalHash) · BuyApproved(address indexed user, bytes32 indexed approvalHash)
Withdrawn(address indexed user, uint256 amount, uint32 domain, bytes32 recipient) // bytes32: EVM address or Solana ATA
Executed(bytes32 indexed batchId, address indexed user, bytes32 indexed asset, uint256 amount, uint32 domain, bytes32 approvalHash, uint256 maxPriceUsd6, uint256 maxFeeUsd6)
BatchSent(bytes32 indexed batchId, uint32 domain, uint256 total)
ReturnedToJar(bytes32 indexed batchId, address indexed user, bytes32 indexed asset, uint256 amount)
Paused(bool) · RelayProposed/ForwarderProposed(uint32 indexed domain, bytes32 value, uint64 eta) · RelaySet/ForwarderSet(uint32 indexed domain, bytes32 value)
KeeperProposed(address keeper, uint64 eta) · KeeperSet(address keeper) · OwnershipTransferStarted(from, to) · OwnershipTransferred(from, to)
// Forwarder: Forwarded(address indexed user, uint256 amount, uint256 maxFee) · RelayerProposed(address, uint64 eta) · RelayerSet(address)
```

## Implementation notes (code in `src/`, Solidity 0.8.28, via-IR)

Choices the spec above left open; the code follows these:

- `MonthIndex.of` is `MonthIndex.monthOf` (`of` is a reserved word in Solidity).
- Error choices: a caller who isn't `a.user` on `cancelApproval` / `approveBuy` → `BadSignature`. `setSolanaRecipient(0)` → `NoSolanaRecipient`. Empty `assets` / `itemIndex` arrays → `LengthMismatch`; `orders` of 0 or > 50, or approval items of 0 or > 16 → `TooManyItems`. `cancelJar` on an empty jar → `ZeroAmount`. Withdraw above `free` → `InsufficientFree(free)`.
- `withdrawCrossChain` burns with `minFinalityThreshold = 2000` (standard, same as `execute`).
- `receiveDeposit` also requires the CCTP header `recipient` = Arc TokenMessengerV2. That proves the message is a real burn, so the body's `messageSender` can be trusted. It also requires `feeExecuted < amount`, a non-zero hookData user, and a 32-byte hookData word.
- `returnToJar` lowers `executedIn` by the amount returned (that's how I7 is enforced).
- Forwarder: `owner` is immutable (set in the constructor). The relayer changes via `proposeRelayer` / `activateRelayer` (48 h). Errors: `NotRelayer` · `NotOwner` · `ZeroAmount` · `FeeTooHigh` · `TimelockNotReady` · `NothingPending`.
- Constructor: `(usdc, tokenMessenger, messageTransmitter, maxBatchUsd6, owner, keeper, DomainValue[] relays, DomainValue[] forwarders)` with `DomainValue { uint32 domain; bytes32 value; }`.

## Invariants

| # | Invariant |
|---|---|
| I1 | `usdc.balanceOf(vault) ≥ totalAccounted == Σ free + Σ jar` |
| I2 | A user's `free` only goes down through that user's own allocate, withdraw or withdrawCrossChain |
| I3 | `execute` only burns to `relay[domain]`, which can't change sooner than 48 h after it's proposed |
| I4 | No jar money moves without a valid, unexpired, uncancelled user signature, and the total per approval item stays ≤ its amount |
| I5 | After `allocate`: `spentInMonth ≤ monthlyCap` |
| I6 | Pause never blocks withdraw, withdrawCrossChain, cancelJar, cancelApproval, returnToJar or receiveDeposit |
| I7 | Σ `returnToJar` per (batch, user, asset) ≤ the amount executed |
| I8 | `receiveDeposit` credits only messages burned by a registered forwarder, and credits exactly the minted amount |
| I9 | The Solana withdraw recipient can't change sooner than 48 h after the user proposes it |
