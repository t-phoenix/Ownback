// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ITokenMessengerV2} from "./interfaces/ITokenMessengerV2.sol";

/// @title OwnbackDepositForwarder (Ethereum, Base, Arbitrum; same bytecode)
/// @notice With a user's allowance, burns their USDC via CCTP V2 into *their own* balance in the Arc vault (Q3).
contract OwnbackDepositForwarder {
    using SafeERC20 for IERC20;

    uint32 public constant ARC_DOMAIN = 26;
    uint32 internal constant MIN_FINALITY_FAST = 1000;
    uint256 public constant MAX_FEE_BPS = 10; // 0.1%
    uint256 public constant TIMELOCK = 48 hours;

    IERC20 public immutable usdc;
    ITokenMessengerV2 public immutable tokenMessenger;
    bytes32 public immutable vaultOnArc; // mintRecipient AND destinationCaller

    address public immutable owner;
    address public relayer;
    address public pendingRelayer;
    uint64 public pendingRelayerEta;

    event Forwarded(address indexed user, uint256 amount, uint256 maxFee);
    event RelayerProposed(address relayer, uint64 eta);
    event RelayerSet(address relayer);

    error NotRelayer();
    error NotOwner();
    error ZeroAmount();
    error FeeTooHigh();
    error TimelockNotReady();
    error NothingPending();

    constructor(
        IERC20 usdc_,
        ITokenMessengerV2 tokenMessenger_,
        bytes32 vaultOnArc_,
        address owner_,
        address relayer_
    ) {
        usdc = usdc_;
        tokenMessenger = tokenMessenger_;
        vaultOnArc = vaultOnArc_;
        owner = owner_;
        relayer = relayer_;
        emit RelayerSet(relayer_);
    }

    function forward(address user, uint256 amount, uint256 maxFee) external {
        if (msg.sender != relayer) revert NotRelayer();
        if (amount == 0) revert ZeroAmount();
        if (maxFee * 10_000 > amount * MAX_FEE_BPS) revert FeeTooHigh();
        usdc.safeTransferFrom(user, address(this), amount);
        usdc.forceApprove(address(tokenMessenger), amount);
        tokenMessenger.depositForBurnWithHook(
            amount, ARC_DOMAIN, vaultOnArc, address(usdc), vaultOnArc, maxFee, MIN_FINALITY_FAST, abi.encode(user)
        );
        emit Forwarded(user, amount, maxFee);
    }

    function proposeRelayer(address r) external {
        if (msg.sender != owner) revert NotOwner();
        pendingRelayer = r;
        pendingRelayerEta = uint64(block.timestamp + TIMELOCK);
        emit RelayerProposed(r, pendingRelayerEta);
    }

    function activateRelayer() external {
        if (msg.sender != owner) revert NotOwner();
        if (pendingRelayerEta == 0) revert NothingPending();
        if (pendingRelayerEta > block.timestamp) revert TimelockNotReady();
        relayer = pendingRelayer;
        pendingRelayer = address(0);
        pendingRelayerEta = 0;
        emit RelayerSet(relayer);
    }
}
