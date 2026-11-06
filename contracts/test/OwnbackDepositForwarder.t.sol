// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {OwnbackDepositForwarder} from "../src/OwnbackDepositForwarder.sol";
import {ITokenMessengerV2} from "../src/interfaces/ITokenMessengerV2.sol";
import {MockUSDC, MockTokenMessenger} from "./mocks/Mocks.sol";

contract OwnbackDepositForwarderTest is Test {
    MockUSDC usdc = new MockUSDC();
    MockTokenMessenger messenger = new MockTokenMessenger();
    bytes32 constant VAULT = bytes32(uint256(uint160(0xA11CE)));
    address owner = makeAddr("owner");
    address relayer = makeAddr("relayer");
    address user = makeAddr("user");
    OwnbackDepositForwarder fwd;

    function setUp() public {
        fwd = new OwnbackDepositForwarder(
            IERC20(address(usdc)), ITokenMessengerV2(address(messenger)), VAULT, owner, relayer
        );
        usdc.mint(user, 20e6);
        vm.prank(user);
        usdc.approve(address(fwd), 1_000e6);
    }

    function test_U45_forward() public {
        vm.expectRevert(OwnbackDepositForwarder.NotRelayer.selector);
        fwd.forward(user, 20e6, 0);

        vm.startPrank(relayer);
        vm.expectRevert(OwnbackDepositForwarder.FeeTooHigh.selector);
        fwd.forward(user, 20e6, 20_001); // > 0.1%
        vm.expectRevert(OwnbackDepositForwarder.ZeroAmount.selector);
        fwd.forward(user, 0, 0);
        fwd.forward(user, 20e6, 20_000);
        vm.stopPrank();

        (uint256 amt, uint32 d, bytes32 r, address t, bytes32 c, uint256 f, uint32 fin,) = messenger.last();
        assertEq(amt, 20e6);
        assertEq(d, 26);
        assertEq(r, VAULT);
        assertEq(t, address(usdc));
        assertEq(c, VAULT);
        assertEq(f, 20_000);
        assertEq(fin, 1000);
        assertEq(abi.decode(messenger.lastHookData(), (address)), user);
        assertEq(usdc.balanceOf(user), 0);
    }

    function test_relayerTimelock() public {
        address next = makeAddr("next");
        vm.expectRevert(OwnbackDepositForwarder.NotOwner.selector);
        fwd.proposeRelayer(next);
        vm.startPrank(owner);
        vm.expectRevert(OwnbackDepositForwarder.NothingPending.selector);
        fwd.activateRelayer();
        fwd.proposeRelayer(next);
        skip(48 hours - 1);
        vm.expectRevert(OwnbackDepositForwarder.TimelockNotReady.selector);
        fwd.activateRelayer();
        skip(1);
        fwd.activateRelayer();
        vm.stopPrank();
        assertEq(fwd.relayer(), next);
    }
}
