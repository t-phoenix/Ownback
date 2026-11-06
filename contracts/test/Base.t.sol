// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {OwnbackVault} from "../src/OwnbackVault.sol";
import {ITokenMessengerV2} from "../src/interfaces/ITokenMessengerV2.sol";
import {IMessageTransmitterV2} from "../src/interfaces/IMessageTransmitterV2.sol";
import {MockUSDC, MockTokenMessenger, MockMessageTransmitter} from "./mocks/Mocks.sol";

abstract contract VaultFixture is Test {
    MockUSDC usdc;
    MockTokenMessenger messenger;
    MockMessageTransmitter transmitter;
    OwnbackVault vault;

    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    bytes32 constant RELAY_SOL = keccak256("relay-sol-ata");
    bytes32 constant RELAY_BASE = bytes32(uint256(uint160(0xBA5E)));
    bytes32 constant FWD_BASE = bytes32(uint256(uint160(0xF0B)));
    uint256 constant MAX_BATCH = 1_000e6;

    bytes32 constant APPLE = keccak256("co:apple");
    bytes32 constant FALLBACK = keccak256("idx:sp500");

    function setUp() public virtual {
        vm.warp(1_762_000_000); // Nov 2025
        usdc = new MockUSDC();
        messenger = new MockTokenMessenger();
        transmitter = new MockMessageTransmitter(usdc);
        OwnbackVault.DomainValue[] memory relays = new OwnbackVault.DomainValue[](2);
        relays[0] = OwnbackVault.DomainValue(5, RELAY_SOL);
        relays[1] = OwnbackVault.DomainValue(6, RELAY_BASE);
        OwnbackVault.DomainValue[] memory fwds = new OwnbackVault.DomainValue[](1);
        fwds[0] = OwnbackVault.DomainValue(6, FWD_BASE);
        vault = new OwnbackVault(
            IERC20(address(usdc)),
            ITokenMessengerV2(address(messenger)),
            IMessageTransmitterV2(address(transmitter)),
            MAX_BATCH,
            owner,
            keeper,
            relays,
            fwds
        );
    }

    // ─── helpers ─────────────────────────────────────────────────────────────
    function _rules(address u, uint64 cap) internal {
        vm.prank(u);
        vault.setRules(OwnbackVault.Rules(500, cap, FALLBACK));
    }

    function _fund(address u, uint256 amt) internal {
        usdc.mint(u, amt);
        vm.startPrank(u);
        usdc.approve(address(vault), amt);
        vault.deposit(amt);
        vm.stopPrank();
    }

    function _one(bytes32 a) internal pure returns (bytes32[] memory x) {
        x = new bytes32[](1);
        x[0] = a;
    }

    function _oneU(uint256 a) internal pure returns (uint256[] memory x) {
        x = new uint256[](1);
        x[0] = a;
    }

    function _alloc(address u, bytes32 pid, bytes32 asset, uint256 amt) internal {
        vm.prank(u);
        vault.allocate(pid, _one(asset), _oneU(amt));
    }

    function _approval(address u, bytes32 asset, uint256 amt, uint32 domain)
        internal
        view
        returns (OwnbackVault.BuyApproval memory a)
    {
        a.user = u;
        a.items = new OwnbackVault.Item[](1);
        a.items[0] = OwnbackVault.Item(asset, amt, domain, 250e6);
        a.maxFeeUsd6 = amt / 20;
        a.nonce = 1;
        a.deadline = uint64(block.timestamp + 30 minutes);
    }

    function _sign(uint256 pk, OwnbackVault.BuyApproval memory a) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, vault.hashApproval(a));
        return abi.encodePacked(r, s, v);
    }

    function _order(OwnbackVault.BuyApproval memory a, bytes memory sig, uint256 amt)
        internal
        pure
        returns (OwnbackVault.Order[] memory o)
    {
        o = new OwnbackVault.Order[](1);
        o[0] = OwnbackVault.Order(a, sig, _oneU(0), _oneU(amt));
    }

    /// CCTP V2 message: 148-byte header + BurnMessageV2 body + hookData.
    function _cctpMsg(
        uint32 srcDomain,
        bytes32 headerRecipient,
        bytes32 mintRecipient,
        uint256 amount,
        bytes32 sender,
        uint256 fee,
        bytes memory hook
    ) internal view returns (bytes memory) {
        bytes memory body = abi.encodePacked(
            uint32(1), bytes32(0), mintRecipient, amount, sender, amount / 1000, fee, uint256(0), hook
        );
        return abi.encodePacked(
            uint32(1),
            srcDomain,
            uint32(26),
            bytes32(uint256(1)),
            bytes32(uint256(uint160(address(messenger)))),
            headerRecipient,
            bytes32(uint256(uint160(address(vault)))),
            uint32(1000),
            uint32(1000),
            body
        );
    }

    function _depositMsg(address user, uint256 amount, uint256 fee) internal view returns (bytes memory) {
        return _cctpMsg(
            6,
            bytes32(uint256(uint160(address(messenger)))),
            bytes32(uint256(uint160(address(vault)))),
            amount,
            FWD_BASE,
            fee,
            abi.encode(user)
        );
    }
}
