// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ITokenMessengerV2} from "./interfaces/ITokenMessengerV2.sol";
import {IMessageTransmitterV2} from "./interfaces/IMessageTransmitterV2.sol";
import {MonthIndex} from "./lib/MonthIndex.sol";

/// @title OwnbackVault (Arc)
/// @notice Holds each user's free USDC and per-asset jars. Jar money leaves only to a fixed,
///         timelocked venue relay, and only under a user-signed BuyApproval. See contracts/vault-spec.md.
contract OwnbackVault is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Types ───────────────────────────────────────────────────────────────
    struct Rules {
        uint16 rateBps;
        uint64 monthlyCap;
        bytes32 fallbackAsset;
    }

    struct Item {
        bytes32 asset;
        uint256 amount;
        uint32 domain;
        uint256 maxPriceUsd6;
    }

    struct BuyApproval {
        address user;
        Item[] items;
        uint256 maxFeeUsd6;
        uint256 nonce;
        uint64 deadline;
    }

    struct Order {
        BuyApproval approval;
        bytes signature;
        uint256[] itemIndex;
        uint256[] amounts;
    }

    struct Pending {
        bytes32 value;
        uint64 eta;
    }

    struct DomainValue {
        uint32 domain;
        bytes32 value;
    }

    // ─── Constants / immutables ──────────────────────────────────────────────
    uint32 public constant ARC_DOMAIN = 26;
    uint32 public constant SOLANA_DOMAIN = 5;
    uint32 internal constant MIN_FINALITY_STANDARD = 2000;
    uint256 public constant TIMELOCK = 48 hours;
    uint256 public constant MAX_ASSETS_PER_PURCHASE = 16;
    uint256 public constant MAX_ITEMS_PER_APPROVAL = 16;
    uint256 public constant MAX_ORDERS_PER_BATCH = 50;
    uint256 public constant MAX_WITHDRAW_FEE_BPS = 10; // 0.1%

    bytes32 public constant ITEM_TYPEHASH =
        keccak256("Item(bytes32 asset,uint256 amount,uint32 domain,uint256 maxPriceUsd6)");
    bytes32 public constant BUY_APPROVAL_TYPEHASH = keccak256(
        "BuyApproval(address user,Item[] items,uint256 maxFeeUsd6,uint256 nonce,uint64 deadline)"
        "Item(bytes32 asset,uint256 amount,uint32 domain,uint256 maxPriceUsd6)"
    );

    IERC20 public immutable usdc;
    ITokenMessengerV2 public immutable tokenMessenger;
    IMessageTransmitterV2 public immutable messageTransmitter;
    uint256 public immutable maxBatchUsd6;

    // ─── Storage ─────────────────────────────────────────────────────────────
    address public owner;
    address public pendingOwner;
    address public keeper;
    bool public paused;

    mapping(address => Rules) public rules;
    mapping(address => uint256) public free;
    mapping(address => mapping(bytes32 => uint256)) public jar;
    mapping(address => mapping(uint32 => uint256)) public spentInMonth;
    mapping(bytes32 => bool) public usedPurchase; // keccak256(abi.encode(user, purchaseId))
    mapping(bytes32 => bool) public usedBatch;
    mapping(bytes32 => mapping(uint256 => uint256)) public approvalUsed;
    mapping(bytes32 => bool) public approvalCancelled;
    mapping(bytes32 => bool) public onchainApproval; // S20 fallback
    mapping(bytes32 => mapping(address => mapping(bytes32 => uint256))) public executedIn;
    mapping(address => bytes32) public solanaRecipient;
    mapping(address => Pending) public pendingSolanaRecipient;
    mapping(uint32 => bytes32) public relay;
    mapping(uint32 => bytes32) public forwarder;
    mapping(uint32 => bool) public withdrawDomain;
    mapping(uint32 => Pending) public pendingRelay;
    mapping(uint32 => Pending) public pendingForwarder;
    Pending public pendingKeeper;
    uint256 public totalAccounted;

    // ─── Events ──────────────────────────────────────────────────────────────
    event RulesSet(address indexed user, uint16 rateBps, uint64 monthlyCap, bytes32 fallbackAsset);
    event SolanaRecipientProposed(address indexed user, bytes32 ata, uint64 eta);
    event SolanaRecipientSet(address indexed user, bytes32 ata);
    event Deposited(address indexed user, uint256 amount, uint32 sourceDomain);
    event Allocated(address indexed user, bytes32 indexed purchaseId, bytes32 indexed asset, uint256 amount);
    event JarCancelled(address indexed user, bytes32 indexed asset, uint256 amount);
    event ApprovalCancelled(address indexed user, bytes32 indexed approvalHash);
    event BuyApproved(address indexed user, bytes32 indexed approvalHash);
    event Withdrawn(address indexed user, uint256 amount, uint32 domain, bytes32 recipient);
    event Executed(
        bytes32 indexed batchId,
        address indexed user,
        bytes32 indexed asset,
        uint256 amount,
        uint32 domain,
        bytes32 approvalHash,
        uint256 maxPriceUsd6,
        uint256 maxFeeUsd6
    );
    event BatchSent(bytes32 indexed batchId, uint32 domain, uint256 total);
    event ReturnedToJar(bytes32 indexed batchId, address indexed user, bytes32 indexed asset, uint256 amount);
    event Paused(bool paused);
    event RelayProposed(uint32 indexed domain, bytes32 value, uint64 eta);
    event RelaySet(uint32 indexed domain, bytes32 value);
    event ForwarderProposed(uint32 indexed domain, bytes32 value, uint64 eta);
    event ForwarderSet(uint32 indexed domain, bytes32 value);
    event KeeperProposed(address keeper, uint64 eta);
    event KeeperSet(address keeper);
    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);

    // ─── Errors ──────────────────────────────────────────────────────────────
    error RateOutOfBounds();
    error InvalidRules();
    error RulesNotSet();
    error ZeroAmount();
    error LengthMismatch();
    error TooManyItems();
    error AssetsNotSorted();
    error PurchaseUsed();
    error InsufficientFree(uint256 available);
    error OverMonthlyCap(uint256 remaining);
    error BatchUsed();
    error UnknownRelay();
    error OverJar();
    error OverBatchCap();
    error BadSignature();
    error ApprovalExpired();
    error ApprovalCancelledErr();
    error OverApproval(uint256 i);
    error WrongDomain();
    error NotKeeper();
    error NotOwner();
    error IsPaused();
    error NoSolanaRecipient();
    error UnsupportedDomain();
    error FeeTooHigh();
    error OverExecuted();
    error NoSurplus();
    error UnknownForwarder();
    error BadDeposit();
    error TimelockNotReady();
    error NothingPending();
    error ZeroAddress();
    error InvalidConfig();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert NotKeeper();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert IsPaused();
        _;
    }

    constructor(
        IERC20 usdc_,
        ITokenMessengerV2 tokenMessenger_,
        IMessageTransmitterV2 messageTransmitter_,
        uint256 maxBatchUsd6_,
        address owner_,
        address keeper_,
        DomainValue[] memory relays_,
        DomainValue[] memory forwarders_
    ) EIP712("OwnbackVault", "1") {
        if (
            address(usdc_) == address(0) || address(tokenMessenger_) == address(0)
                || address(messageTransmitter_) == address(0) || owner_ == address(0) || keeper_ == address(0)
        ) revert ZeroAddress();
        if (maxBatchUsd6_ == 0) revert InvalidConfig();
        usdc = usdc_;
        tokenMessenger = tokenMessenger_;
        messageTransmitter = messageTransmitter_;
        maxBatchUsd6 = maxBatchUsd6_;
        owner = owner_;
        keeper = keeper_;
        for (uint256 i; i < relays_.length; ++i) {
            relay[relays_[i].domain] = relays_[i].value;
            emit RelaySet(relays_[i].domain, relays_[i].value);
        }
        for (uint256 i; i < forwarders_.length; ++i) {
            forwarder[forwarders_[i].domain] = forwarders_[i].value;
            emit ForwarderSet(forwarders_[i].domain, forwarders_[i].value);
        }
        withdrawDomain[0] = true;
        withdrawDomain[3] = true;
        withdrawDomain[5] = true;
        withdrawDomain[6] = true;
        emit OwnershipTransferred(address(0), owner_);
        emit KeeperSet(keeper_);
    }

    // ─── User: rules & recipients ────────────────────────────────────────────
    function setRules(Rules calldata r) external {
        if (r.rateBps < 200 || r.rateBps > 1000) revert RateOutOfBounds();
        if (r.monthlyCap == 0 || r.fallbackAsset == bytes32(0)) revert InvalidRules();
        rules[msg.sender] = r;
        emit RulesSet(msg.sender, r.rateBps, r.monthlyCap, r.fallbackAsset);
    }

    function setSolanaRecipient(bytes32 ata) external {
        if (ata == bytes32(0)) revert NoSolanaRecipient();
        if (solanaRecipient[msg.sender] == bytes32(0)) {
            solanaRecipient[msg.sender] = ata;
            emit SolanaRecipientSet(msg.sender, ata);
        } else {
            uint64 eta = uint64(block.timestamp + TIMELOCK);
            pendingSolanaRecipient[msg.sender] = Pending(ata, eta);
            emit SolanaRecipientProposed(msg.sender, ata, eta);
        }
    }

    function activateSolanaRecipient() external {
        Pending memory p = pendingSolanaRecipient[msg.sender];
        if (p.eta == 0) revert NothingPending();
        if (p.eta > block.timestamp) revert TimelockNotReady();
        delete pendingSolanaRecipient[msg.sender];
        solanaRecipient[msg.sender] = p.value;
        emit SolanaRecipientSet(msg.sender, p.value);
    }

    // ─── User: money in ──────────────────────────────────────────────────────
    function deposit(uint256 amount) external nonReentrant {
        _deposit(amount);
    }

    function allocate(bytes32 purchaseId, bytes32[] calldata assets, uint256[] calldata amounts)
        external
        whenNotPaused
    {
        _allocate(purchaseId, assets, amounts);
    }

    function depositAndAllocate(uint256 dep, bytes32 purchaseId, bytes32[] calldata assets, uint256[] calldata amounts)
        external
        whenNotPaused
        nonReentrant
    {
        _deposit(dep);
        _allocate(purchaseId, assets, amounts);
    }

    function cancelJar(bytes32 asset) external {
        uint256 amt = jar[msg.sender][asset];
        if (amt == 0) revert ZeroAmount();
        jar[msg.sender][asset] = 0;
        free[msg.sender] += amt; // monthly counter deliberately not refunded
        emit JarCancelled(msg.sender, asset, amt);
    }

    // ─── User: approvals ─────────────────────────────────────────────────────
    function cancelApproval(BuyApproval calldata a) external {
        if (msg.sender != a.user) revert BadSignature();
        bytes32 h = hashApproval(a);
        approvalCancelled[h] = true;
        emit ApprovalCancelled(msg.sender, h);
    }

    /// S20 fallback: the user records the approval on-chain instead of signing typed data.
    function approveBuy(BuyApproval calldata a) external {
        if (msg.sender != a.user) revert BadSignature();
        if (a.deadline < block.timestamp) revert ApprovalExpired();
        bytes32 h = hashApproval(a);
        if (approvalCancelled[h]) revert ApprovalCancelledErr();
        onchainApproval[h] = true;
        emit BuyApproved(msg.sender, h);
    }

    // ─── User: money out (always to the user's own address) ──────────────────
    function withdraw(uint256 amount) external nonReentrant {
        _debitFree(amount);
        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount, ARC_DOMAIN, _b32(msg.sender));
    }

    function withdrawCrossChain(uint256 amount, uint32 domain, uint256 maxFee) external nonReentrant {
        if (!withdrawDomain[domain]) revert UnsupportedDomain();
        bytes32 recipient = _b32(msg.sender);
        if (domain == SOLANA_DOMAIN) {
            recipient = solanaRecipient[msg.sender];
            if (recipient == bytes32(0)) revert NoSolanaRecipient();
        }
        if (maxFee * 10_000 > amount * MAX_WITHDRAW_FEE_BPS) revert FeeTooHigh();
        _debitFree(amount);
        usdc.forceApprove(address(tokenMessenger), amount);
        tokenMessenger.depositForBurn(
            amount, domain, recipient, address(usdc), bytes32(0), maxFee, MIN_FINALITY_STANDARD
        );
        emit Withdrawn(msg.sender, amount, domain, recipient);
    }

    // ─── Keeper ──────────────────────────────────────────────────────────────
    function execute(bytes32 batchId, uint32 domain, Order[] calldata orders)
        external
        onlyKeeper
        whenNotPaused
        nonReentrant
    {
        if (usedBatch[batchId]) revert BatchUsed();
        bytes32 to = relay[domain];
        if (to == bytes32(0)) revert UnknownRelay();
        if (orders.length == 0 || orders.length > MAX_ORDERS_PER_BATCH) revert TooManyItems();

        uint256 total;
        for (uint256 o; o < orders.length; ++o) {
            total += _executeOrder(batchId, domain, orders[o]);
        }
        if (total > maxBatchUsd6) revert OverBatchCap();

        usedBatch[batchId] = true;
        totalAccounted -= total;
        usdc.forceApprove(address(tokenMessenger), total);
        tokenMessenger.depositForBurn(total, domain, to, address(usdc), bytes32(0), 0, MIN_FINALITY_STANDARD);
        emit BatchSent(batchId, domain, total);
    }

    /// Puts money that came back (failed or partial buy) into the jar it left from.
    function returnToJar(bytes32 batchId, address user, bytes32 asset, uint256 amount)
        external
        onlyKeeper
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();
        uint256 executed = executedIn[batchId][user][asset];
        if (amount > executed) revert OverExecuted();
        if (usdc.balanceOf(address(this)) < totalAccounted + amount) revert NoSurplus();
        executedIn[batchId][user][asset] = executed - amount;
        jar[user][asset] += amount;
        totalAccounted += amount;
        emit ReturnedToJar(batchId, user, asset, amount);
    }

    /// Relays a CCTP V2 burn from a registered forwarder and credits the user in hookData.
    /// The vault is the burn's destinationCaller, so only this function can deliver it.
    function receiveDeposit(bytes calldata message, bytes calldata attestation) external nonReentrant {
        // CCTP V2 header: 148 bytes; BurnMessageV2 body fields up to hookData: 228 bytes; hookData: 32.
        if (message.length < 148 + 228 + 32) revert BadDeposit();
        uint256 before = usdc.balanceOf(address(this));
        if (!messageTransmitter.receiveMessage(message, attestation)) revert BadDeposit();

        uint32 sourceDomain = uint32(bytes4(message[4:8]));
        bytes32 headerRecipient = bytes32(message[76:108]);
        bytes calldata body = message[148:];
        bytes32 mintRecipient = bytes32(body[36:68]);
        uint256 amount = uint256(bytes32(body[68:100]));
        bytes32 messageSender = bytes32(body[100:132]);
        uint256 feeExecuted = uint256(bytes32(body[164:196]));

        bytes32 fwd = forwarder[sourceDomain];
        if (fwd == bytes32(0) || fwd != messageSender) revert UnknownForwarder();
        // Header recipient = Arc TokenMessenger proves this is a real burn, so the body is trustworthy.
        if (headerRecipient != _b32(address(tokenMessenger)) || mintRecipient != _b32(address(this))) {
            revert BadDeposit();
        }
        address user = abi.decode(body[228:], (address));
        if (user == address(0) || feeExecuted >= amount) revert BadDeposit();
        uint256 credited = amount - feeExecuted;
        if (usdc.balanceOf(address(this)) - before != credited) revert BadDeposit();

        free[user] += credited;
        totalAccounted += credited;
        emit Deposited(user, credited, sourceDomain);
    }

    // ─── Owner ───────────────────────────────────────────────────────────────
    function pause() external onlyOwner {
        paused = true;
        emit Paused(true);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Paused(false);
    }

    function proposeRelay(uint32 domain, bytes32 value) external onlyOwner {
        uint64 eta = uint64(block.timestamp + TIMELOCK);
        pendingRelay[domain] = Pending(value, eta);
        emit RelayProposed(domain, value, eta);
    }

    function activateRelay(uint32 domain) external onlyOwner {
        bytes32 v = _takePending(pendingRelay[domain]);
        delete pendingRelay[domain];
        relay[domain] = v;
        emit RelaySet(domain, v);
    }

    function proposeForwarder(uint32 domain, bytes32 value) external onlyOwner {
        uint64 eta = uint64(block.timestamp + TIMELOCK);
        pendingForwarder[domain] = Pending(value, eta);
        emit ForwarderProposed(domain, value, eta);
    }

    function activateForwarder(uint32 domain) external onlyOwner {
        bytes32 v = _takePending(pendingForwarder[domain]);
        delete pendingForwarder[domain];
        forwarder[domain] = v;
        emit ForwarderSet(domain, v);
    }

    function proposeKeeper(address k) external onlyOwner {
        uint64 eta = uint64(block.timestamp + TIMELOCK);
        pendingKeeper = Pending(_b32(k), eta);
        emit KeeperProposed(k, eta);
    }

    function activateKeeper() external onlyOwner {
        address k = address(uint160(uint256(_takePending(pendingKeeper))));
        delete pendingKeeper;
        keeper = k;
        emit KeeperSet(k);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    // ─── Views ───────────────────────────────────────────────────────────────
    function currentMonth() public view returns (uint32) {
        return MonthIndex.monthOf(block.timestamp);
    }

    function remainingThisMonth(address user) public view returns (uint256) {
        uint256 cap = rules[user].monthlyCap;
        uint256 spent = spentInMonth[user][currentMonth()];
        return spent >= cap ? 0 : cap - spent;
    }

    function jarsOf(address user, bytes32[] calldata assets) external view returns (uint256[] memory out) {
        out = new uint256[](assets.length);
        for (uint256 i; i < assets.length; ++i) {
            out[i] = jar[user][assets[i]];
        }
    }

    /// Unspent amount of item `i`. Takes the approval itself: item amounts aren't stored on-chain.
    function approvalRemaining(BuyApproval calldata a, uint256 i) external view returns (uint256) {
        bytes32 h = hashApproval(a);
        if (approvalCancelled[h] || a.deadline < block.timestamp) return 0;
        return a.items[i].amount - approvalUsed[h][i];
    }

    function hashApproval(BuyApproval calldata a) public view returns (bytes32) {
        uint256 n = a.items.length;
        if (n == 0 || n > MAX_ITEMS_PER_APPROVAL) revert TooManyItems();
        bytes32[] memory itemHashes = new bytes32[](n);
        for (uint256 i; i < n; ++i) {
            Item calldata it = a.items[i];
            itemHashes[i] = keccak256(abi.encode(ITEM_TYPEHASH, it.asset, it.amount, it.domain, it.maxPriceUsd6));
        }
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    BUY_APPROVAL_TYPEHASH,
                    a.user,
                    keccak256(abi.encodePacked(itemHashes)),
                    a.maxFeeUsd6,
                    a.nonce,
                    a.deadline
                )
            )
        );
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ─── Internal ────────────────────────────────────────────────────────────
    function _deposit(uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        free[msg.sender] += amount;
        totalAccounted += amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount, ARC_DOMAIN);
    }

    function _allocate(bytes32 purchaseId, bytes32[] calldata assets, uint256[] calldata amounts) internal {
        Rules memory r = rules[msg.sender];
        if (r.monthlyCap == 0) revert RulesNotSet();
        uint256 n = assets.length;
        if (n == 0 || n != amounts.length) revert LengthMismatch();
        if (n > MAX_ASSETS_PER_PURCHASE) revert TooManyItems();
        bytes32 key = keccak256(abi.encode(msg.sender, purchaseId));
        if (usedPurchase[key]) revert PurchaseUsed();

        uint256 sum;
        for (uint256 i; i < n; ++i) {
            if (i > 0 && assets[i] <= assets[i - 1]) revert AssetsNotSorted();
            if (amounts[i] == 0) revert ZeroAmount();
            sum += amounts[i];
        }
        uint256 available = free[msg.sender];
        if (sum > available) revert InsufficientFree(available);
        uint32 month = currentMonth();
        uint256 spent = spentInMonth[msg.sender][month];
        if (spent + sum > r.monthlyCap) revert OverMonthlyCap(spent >= r.monthlyCap ? 0 : r.monthlyCap - spent);

        usedPurchase[key] = true;
        free[msg.sender] = available - sum;
        spentInMonth[msg.sender][month] = spent + sum;
        for (uint256 i; i < n; ++i) {
            jar[msg.sender][assets[i]] += amounts[i];
            emit Allocated(msg.sender, purchaseId, assets[i], amounts[i]);
        }
    }

    function _executeOrder(bytes32 batchId, uint32 domain, Order calldata ord) internal returns (uint256 total) {
        BuyApproval calldata a = ord.approval;
        bytes32 h = hashApproval(a);
        if (a.deadline < block.timestamp) revert ApprovalExpired();
        if (approvalCancelled[h]) revert ApprovalCancelledErr();
        if (!onchainApproval[h] && !SignatureChecker.isValidSignatureNow(a.user, h, ord.signature)) {
            revert BadSignature();
        }
        uint256 n = ord.itemIndex.length;
        if (n == 0 || n != ord.amounts.length) revert LengthMismatch();
        if (n > MAX_ITEMS_PER_APPROVAL) revert TooManyItems();

        for (uint256 k; k < n; ++k) {
            uint256 i = ord.itemIndex[k];
            uint256 amt = ord.amounts[k];
            Item calldata it = a.items[i];
            if (it.domain != domain) revert WrongDomain();
            if (amt == 0) revert ZeroAmount();
            uint256 used = approvalUsed[h][i] + amt;
            if (used > it.amount) revert OverApproval(i);
            uint256 j = jar[a.user][it.asset];
            if (amt > j) revert OverJar();

            jar[a.user][it.asset] = j - amt;
            approvalUsed[h][i] = used;
            executedIn[batchId][a.user][it.asset] += amt;
            total += amt;
            emit Executed(batchId, a.user, it.asset, amt, domain, h, it.maxPriceUsd6, a.maxFeeUsd6);
        }
    }

    function _debitFree(uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        uint256 available = free[msg.sender];
        if (amount > available) revert InsufficientFree(available);
        free[msg.sender] = available - amount;
        totalAccounted -= amount;
    }

    function _takePending(Pending storage p) internal view returns (bytes32) {
        if (p.eta == 0) revert NothingPending();
        if (p.eta > block.timestamp) revert TimelockNotReady();
        return p.value;
    }

    function _b32(address a) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(a)));
    }
}
