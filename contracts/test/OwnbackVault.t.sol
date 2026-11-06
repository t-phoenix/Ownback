// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {VaultFixture} from "./Base.t.sol";
import {OwnbackVault} from "../src/OwnbackVault.sol";
import {MonthIndex} from "../src/lib/MonthIndex.sol";
import {MockSmartAccount} from "./mocks/Mocks.sol";

contract MonthIndexHarness {
    function monthOf(uint256 t) external pure returns (uint32) {
        return MonthIndex.monthOf(t);
    }
}

contract OwnbackVaultTest is VaultFixture {
    address alice;
    uint256 alicePk;
    address bob = makeAddr("bob");

    function setUp() public override {
        super.setUp();
        (alice, alicePk) = makeAddrAndKey("alice");
    }

    // ─── Rules ───────────────────────────────────────────────────────────────
    function test_U1_U2_setRulesBounds() public {
        vm.startPrank(alice);
        vm.expectRevert(OwnbackVault.RateOutOfBounds.selector);
        vault.setRules(OwnbackVault.Rules(199, 50e6, FALLBACK));
        vm.expectRevert(OwnbackVault.RateOutOfBounds.selector);
        vault.setRules(OwnbackVault.Rules(1001, 50e6, FALLBACK));
        vm.expectRevert(OwnbackVault.InvalidRules.selector);
        vault.setRules(OwnbackVault.Rules(500, 0, FALLBACK));
        vm.expectRevert(OwnbackVault.InvalidRules.selector);
        vault.setRules(OwnbackVault.Rules(500, 50e6, bytes32(0)));
        vault.setRules(OwnbackVault.Rules(200, 50e6, FALLBACK));
        vault.setRules(OwnbackVault.Rules(1000, 50e6, FALLBACK));
        vm.stopPrank();
    }

    function test_U3_allocateBeforeRules() public {
        _fund(alice, 10e6);
        vm.expectRevert(OwnbackVault.RulesNotSet.selector);
        _alloc(alice, "p", APPLE, 1e6);
    }

    function test_U4_deposit() public {
        _fund(alice, 12_350_000);
        assertEq(vault.free(alice), 12_350_000);
        assertEq(vault.totalAccounted(), 12_350_000);
        assertEq(usdc.balanceOf(address(vault)), 12_350_000);
    }

    // ─── Allocate ────────────────────────────────────────────────────────────
    function _wireframe() internal pure returns (bytes32[] memory a, uint256[] memory m) {
        string[6] memory slugs = ["co:apple", "co:tsmc", "co:qualcomm", "co:corning", "mat:gold", "mat:silver"];
        uint256[6] memory amts = [uint256(33_430_000), 3_180_000, 3_180_000, 3_190_000, 2_390_000, 2_380_000];
        a = new bytes32[](6);
        m = new uint256[](6);
        for (uint256 i; i < 6; ++i) {
            a[i] = keccak256(bytes(slugs[i]));
            m[i] = amts[i];
        }
        // insertion sort by asset id
        for (uint256 i = 1; i < 6; ++i) {
            for (uint256 j = i; j > 0 && a[j] < a[j - 1]; --j) {
                (a[j], a[j - 1]) = (a[j - 1], a[j]);
                (m[j], m[j - 1]) = (m[j - 1], m[j]);
            }
        }
    }

    function test_U5_wireframeExample() public {
        _rules(alice, 50e6);
        _fund(alice, 50e6);
        (bytes32[] memory a, uint256[] memory m) = _wireframe();
        vm.prank(alice);
        vault.allocate("iphone", a, m);
        assertEq(vault.jar(alice, APPLE), 33_430_000); // no per-asset max
        assertEq(vault.free(alice), 50e6 - 47_750_000);
        assertEq(vault.spentInMonth(alice, vault.currentMonth()), 47_750_000);
        uint256[] memory jars = vault.jarsOf(alice, a);
        for (uint256 i; i < 6; ++i) {
            assertEq(jars[i], m[i]);
        }
    }

    function test_U6_overMonthlyCap() public {
        _rules(alice, 50e6);
        _fund(alice, 100e6);
        _alloc(alice, "p1", APPLE, 45e6);
        (bytes32[] memory a, uint256[] memory m) = _wireframe();
        vm.expectRevert(abi.encodeWithSelector(OwnbackVault.OverMonthlyCap.selector, 5e6));
        vm.prank(alice);
        vault.allocate("p2", a, m);
    }

    function test_U8_U9_purchaseIdPerUser() public {
        _rules(alice, 50e6);
        _rules(bob, 50e6);
        _fund(alice, 10e6);
        _fund(bob, 10e6);
        _alloc(alice, "p", APPLE, 1e6);
        _alloc(bob, "p", APPLE, 1e6); // U9: other user, same id OK
        vm.expectRevert(OwnbackVault.PurchaseUsed.selector);
        _alloc(alice, "p", APPLE, 1e6);
    }

    function test_U10_unsortedOrDuplicate() public {
        _rules(alice, 50e6);
        _fund(alice, 10e6);
        bytes32[] memory a = new bytes32[](2);
        uint256[] memory m = new uint256[](2);
        m[0] = 1e6;
        m[1] = 1e6;
        a[0] = APPLE;
        a[1] = APPLE;
        vm.prank(alice);
        vm.expectRevert(OwnbackVault.AssetsNotSorted.selector);
        vault.allocate("p", a, m);
        (a[0], a[1]) = APPLE < FALLBACK ? (FALLBACK, APPLE) : (APPLE, FALLBACK);
        vm.prank(alice);
        vm.expectRevert(OwnbackVault.AssetsNotSorted.selector);
        vault.allocate("p", a, m);
    }

    function test_allocateShapeErrors() public {
        _rules(alice, 50e6);
        _fund(alice, 10e6);
        vm.startPrank(alice);
        vm.expectRevert(OwnbackVault.LengthMismatch.selector);
        vault.allocate("p", _one(APPLE), new uint256[](2));
        vm.expectRevert(OwnbackVault.LengthMismatch.selector);
        vault.allocate("p", new bytes32[](0), new uint256[](0));
        vm.expectRevert(OwnbackVault.TooManyItems.selector);
        vault.allocate("p", new bytes32[](17), new uint256[](17));
        vm.expectRevert(OwnbackVault.ZeroAmount.selector);
        vault.allocate("p", _one(APPLE), _oneU(0));
        vm.stopPrank();
    }

    function test_U11_insufficientFree() public {
        _rules(alice, 50e6);
        _fund(alice, 5e6);
        vm.expectRevert(abi.encodeWithSelector(OwnbackVault.InsufficientFree.selector, 5e6));
        _alloc(alice, "p", APPLE, 6e6);
    }

    function test_U12_depositAndAllocate() public {
        _rules(alice, 50e6);
        _fund(alice, 35_400_000);
        usdc.mint(alice, 12_350_000);
        (bytes32[] memory a, uint256[] memory m) = _wireframe();
        vm.startPrank(alice);
        usdc.approve(address(vault), 12_350_000);
        vault.depositAndAllocate(12_350_000, "p", a, m);
        vm.stopPrank();
        assertEq(vault.free(alice), 0);
        assertEq(vault.totalAccounted(), 47_750_000);
    }

    function test_U13_monthRollover() public {
        vm.warp(1_764_547_140); // 2025-11-30 23:59:00 UTC
        _rules(alice, 50e6);
        _fund(alice, 100e6);
        _alloc(alice, "p1", APPLE, 50e6);
        vm.expectRevert(abi.encodeWithSelector(OwnbackVault.OverMonthlyCap.selector, 0));
        _alloc(alice, "p2", APPLE, 1e6);
        vm.warp(1_764_547_200); // 2025-12-01 00:00:00 UTC
        _alloc(alice, "p2", APPLE, 50e6);
        assertEq(vault.remainingThisMonth(alice), 0);
    }

    function test_U14_monthIndexKnownDates() public {
        MonthIndexHarness h = new MonthIndexHarness();
        assertEq(h.monthOf(0), 1970 * 12); // 1970-01-01
        assertEq(h.monthOf(951_782_400), 2000 * 12 + 1); // 2000-02-29 (leap)
        assertEq(h.monthOf(951_868_799), 2000 * 12 + 1); // 2000-02-29 23:59:59
        assertEq(h.monthOf(951_868_800), 2000 * 12 + 2); // 2000-03-01
        assertEq(h.monthOf(1_709_164_800), 2024 * 12 + 1); // 2024-02-29
        assertEq(h.monthOf(1_767_225_599), 2025 * 12 + 11); // 2025-12-31 23:59:59
        assertEq(h.monthOf(1_767_225_600), 2026 * 12); // 2026-01-01
        assertEq(h.monthOf(4_107_542_400), 2100 * 12 + 2); // 2100-03-01 (2100 not leap)
        assertEq(h.monthOf(4_107_542_399), 2100 * 12 + 1); // 2100-02-28 23:59:59
    }

    function test_U15_cancelJar() public {
        _rules(alice, 50e6);
        _fund(alice, 10e6);
        _alloc(alice, "p", APPLE, 4e6);
        uint32 mo = vault.currentMonth();
        vm.prank(alice);
        vault.cancelJar(APPLE);
        assertEq(vault.jar(alice, APPLE), 0);
        assertEq(vault.free(alice), 10e6);
        assertEq(vault.spentInMonth(alice, mo), 4e6);
        vm.prank(alice);
        vm.expectRevert(OwnbackVault.ZeroAmount.selector);
        vault.cancelJar(APPLE);
    }

    // ─── Withdraw ────────────────────────────────────────────────────────────
    function test_U16_withdrawOwnOnly() public {
        _fund(alice, 10e6);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(OwnbackVault.InsufficientFree.selector, 0));
        vault.withdraw(1e6);
        vm.prank(alice);
        vault.withdraw(4e6);
        assertEq(usdc.balanceOf(alice), 4e6);
        assertEq(vault.free(alice), 6e6);
        assertEq(vault.totalAccounted(), 6e6);
    }

    function test_U17_noSolanaRecipient() public {
        _fund(alice, 10e6);
        vm.prank(alice);
        vm.expectRevert(OwnbackVault.NoSolanaRecipient.selector);
        vault.withdrawCrossChain(1e6, 5, 0);
    }

    function test_U18_unsupportedDomain() public {
        _fund(alice, 10e6);
        vm.startPrank(alice);
        vm.expectRevert(OwnbackVault.UnsupportedDomain.selector);
        vault.withdrawCrossChain(1e6, 26, 0);
        vm.expectRevert(OwnbackVault.UnsupportedDomain.selector);
        vault.withdrawCrossChain(1e6, 99, 0);
        vm.stopPrank();
    }

    function test_U19_withdrawCrossChainArgs() public {
        _fund(alice, 10e6);
        vm.prank(alice);
        vault.withdrawCrossChain(2e6, 6, 2000);
        (uint256 amt, uint32 d, bytes32 r, address t, bytes32 c, uint256 f,,) = messenger.last();
        assertEq(amt, 2e6);
        assertEq(d, 6);
        assertEq(r, bytes32(uint256(uint160(alice))));
        assertEq(t, address(usdc));
        assertEq(c, bytes32(0));
        assertEq(f, 2000);

        bytes32 ata = keccak256("alice-ata");
        vm.startPrank(alice);
        vault.setSolanaRecipient(ata);
        vault.withdrawCrossChain(1e6, 5, 0);
        vm.stopPrank();
        (, d, r,,,,,) = messenger.last();
        assertEq(d, 5);
        assertEq(r, ata);
        assertEq(vault.free(alice), 7e6);
        assertEq(vault.totalAccounted(), 7e6);
    }

    function test_U42_withdrawFeeTooHigh() public {
        _fund(alice, 10e6);
        vm.prank(alice);
        vm.expectRevert(OwnbackVault.FeeTooHigh.selector);
        vault.withdrawCrossChain(1e6, 6, 1001);
    }

    function test_U41_solanaRecipientTimelock() public {
        bytes32 a1 = keccak256("ata1");
        bytes32 a2 = keccak256("ata2");
        vm.startPrank(alice);
        vm.expectRevert(OwnbackVault.NothingPending.selector);
        vault.activateSolanaRecipient();
        vault.setSolanaRecipient(a1);
        assertEq(vault.solanaRecipient(alice), a1);
        vault.setSolanaRecipient(a2);
        assertEq(vault.solanaRecipient(alice), a1);
        skip(48 hours - 1);
        vm.expectRevert(OwnbackVault.TimelockNotReady.selector);
        vault.activateSolanaRecipient();
        skip(1);
        vault.activateSolanaRecipient();
        assertEq(vault.solanaRecipient(alice), a2);
        vm.stopPrank();
    }

    // ─── Execute ─────────────────────────────────────────────────────────────
    function _ready(uint256 amt) internal returns (OwnbackVault.BuyApproval memory a, bytes memory sig) {
        _rules(alice, 10_000e6);
        _fund(alice, amt);
        _alloc(alice, "p", APPLE, amt);
        a = _approval(alice, APPLE, amt, 5);
        sig = _sign(alicePk, a);
    }

    function test_U20_notKeeper() public {
        (OwnbackVault.BuyApproval memory a, bytes memory sig) = _ready(3e6);
        vm.expectRevert(OwnbackVault.NotKeeper.selector);
        vault.execute("b", 5, _order(a, sig, 3e6));
    }

    function test_U21_U26_executeSmallItem() public {
        (OwnbackVault.BuyApproval memory a, bytes memory sig) = _ready(3e6);
        bytes32 h = vault.hashApproval(a);
        vm.expectEmit(address(vault));
        emit OwnbackVault.Executed("b", alice, APPLE, 3e6, 5, h, 250e6, a.maxFeeUsd6);
        vm.expectEmit(address(vault));
        emit OwnbackVault.BatchSent("b", 5, 3e6);
        vm.prank(keeper);
        vault.execute("b", 5, _order(a, sig, 3e6));

        (uint256 amt, uint32 d, bytes32 r,,, uint256 f, uint32 fin,) = messenger.last();
        assertEq(amt, 3e6);
        assertEq(d, 5);
        assertEq(r, RELAY_SOL);
        assertEq(f, 0);
        assertEq(fin, 2000);
        assertEq(vault.jar(alice, APPLE), 0);
        assertEq(vault.totalAccounted(), 0);
        assertEq(vault.executedIn("b", alice, APPLE), 3e6);
        assertEq(vault.approvalRemaining(a, 0), 0);
    }

    function test_U22_overJar() public {
        (OwnbackVault.BuyApproval memory a,) = _ready(3e6);
        a.items[0].amount = 5e6;
        bytes memory sig = _sign(alicePk, a);
        vm.prank(keeper);
        vm.expectRevert(OwnbackVault.OverJar.selector);
        vault.execute("b", 5, _order(a, sig, 4e6));
    }

    function test_U23_batchUsed() public {
        (OwnbackVault.BuyApproval memory a, bytes memory sig) = _ready(4e6);
        vm.startPrank(keeper);
        vault.execute("b", 5, _order(a, sig, 2e6));
        vm.expectRevert(OwnbackVault.BatchUsed.selector);
        vault.execute("b", 5, _order(a, sig, 2e6));
        vm.stopPrank();
    }

    function test_U24_unknownRelay() public {
        (OwnbackVault.BuyApproval memory a, bytes memory sig) = _ready(3e6);
        vm.prank(keeper);
        vm.expectRevert(OwnbackVault.UnknownRelay.selector);
        vault.execute("b", 0, _order(a, sig, 3e6));
    }

    function test_U25_overBatchCap() public {
        (OwnbackVault.BuyApproval memory a, bytes memory sig) = _ready(MAX_BATCH + 1);
        vm.prank(keeper);
        vm.expectRevert(OwnbackVault.OverBatchCap.selector);
        vault.execute("b", 5, _order(a, sig, MAX_BATCH + 1));
    }

    function test_U35_badSignatures() public {
        (OwnbackVault.BuyApproval memory a,) = _ready(3e6);
        (, uint256 evePk) = makeAddrAndKey("eve");
        bytes memory eveSig = _sign(evePk, a);
        vm.startPrank(keeper);
        vm.expectRevert(OwnbackVault.BadSignature.selector);
        vault.execute("b", 5, _order(a, "", 3e6));
        vm.expectRevert(OwnbackVault.BadSignature.selector);
        vault.execute("b", 5, _order(a, eveSig, 3e6));
        vm.stopPrank();

        // Same struct signed for a different chain id (EIP-712 domain) is rejected.
        vm.chainId(1);
        bytes memory otherChain = _sign(alicePk, a);
        vm.chainId(31337); // literal: via-IR re-reads block.chainid after the cheatcode
        vm.prank(keeper);
        vm.expectRevert(OwnbackVault.BadSignature.selector);
        vault.execute("b", 5, _order(a, otherChain, 3e6));
    }

    function test_U36_expiredAndCancelled() public {
        (OwnbackVault.BuyApproval memory a, bytes memory sig) = _ready(3e6);
        skip(31 minutes);
        vm.prank(keeper);
        vm.expectRevert(OwnbackVault.ApprovalExpired.selector);
        vault.execute("b", 5, _order(a, sig, 3e6));

        a.deadline = uint64(block.timestamp + 30 minutes);
        sig = _sign(alicePk, a);
        vm.prank(bob);
        vm.expectRevert(OwnbackVault.BadSignature.selector);
        vault.cancelApproval(a);
        vm.prank(alice);
        vault.cancelApproval(a);
        vm.prank(keeper);
        vm.expectRevert(OwnbackVault.ApprovalCancelledErr.selector);
        vault.execute("b", 5, _order(a, sig, 3e6));
    }

    function test_U37_overApprovalAcrossBatches() public {
        _rules(alice, 1_000e6);
        _fund(alice, 10e6);
        _alloc(alice, "p", APPLE, 10e6);
        OwnbackVault.BuyApproval memory a = _approval(alice, APPLE, 5e6, 5);
        bytes memory sig = _sign(alicePk, a);
        vm.startPrank(keeper);
        vault.execute("b1", 5, _order(a, sig, 3e6));
        vm.expectRevert(abi.encodeWithSelector(OwnbackVault.OverApproval.selector, 0));
        vault.execute("b2", 5, _order(a, sig, 3e6));
        vault.execute("b2", 5, _order(a, sig, 2e6));
        vm.stopPrank();
        assertEq(vault.jar(alice, APPLE), 5e6);
    }

    function test_U38_wrongDomain() public {
        (OwnbackVault.BuyApproval memory a, bytes memory sig) = _ready(3e6);
        vm.prank(keeper);
        vm.expectRevert(OwnbackVault.WrongDomain.selector);
        vault.execute("b", 6, _order(a, sig, 3e6));
    }

    function test_U39_erc1271() public {
        MockSmartAccount sca = new MockSmartAccount(alice);
        address u = address(sca);
        _rules(u, 1_000e6);
        _fund(u, 6e6);
        _alloc(u, "p", APPLE, 6e6);
        OwnbackVault.BuyApproval memory a = _approval(u, APPLE, 6e6, 5);
        bytes memory sig = _sign(alicePk, a);
        vm.prank(keeper);
        vault.execute("b1", 5, _order(a, sig, 3e6));

        sca.setBroken(true);
        vm.prank(keeper);
        vm.expectRevert(OwnbackVault.BadSignature.selector);
        vault.execute("b2", 5, _order(a, sig, 3e6));
    }

    function test_S20_onchainApproval() public {
        (OwnbackVault.BuyApproval memory a,) = _ready(3e6);
        vm.prank(bob);
        vm.expectRevert(OwnbackVault.BadSignature.selector);
        vault.approveBuy(a);
        vm.prank(alice);
        vault.approveBuy(a);
        vm.prank(keeper);
        vault.execute("b", 5, _order(a, "", 3e6));
        assertEq(vault.jar(alice, APPLE), 0);
    }

    // ─── returnToJar ─────────────────────────────────────────────────────────
    function test_U27_U28_U29_returnToJar() public {
        (OwnbackVault.BuyApproval memory a, bytes memory sig) = _ready(5e6);
        vm.prank(keeper);
        vault.execute("b", 5, _order(a, sig, 5e6));

        vm.startPrank(keeper);
        vm.expectRevert(OwnbackVault.NoSurplus.selector);
        vault.returnToJar("b", alice, APPLE, 5e6);
        usdc.mint(address(vault), 5e6); // mock CCTP mint back
        vm.expectRevert(OwnbackVault.OverExecuted.selector);
        vault.returnToJar("b", alice, APPLE, 5e6 + 1);
        vault.returnToJar("b", alice, APPLE, 5e6);
        vm.expectRevert(OwnbackVault.OverExecuted.selector);
        vault.returnToJar("b", alice, APPLE, 1);
        vm.stopPrank();
        assertEq(vault.jar(alice, APPLE), 5e6);
        assertEq(vault.totalAccounted(), 5e6);
    }

    // ─── receiveDeposit + forwarder path ─────────────────────────────────────
    function test_U43_receiveDeposit() public {
        bytes memory m = _depositMsg(alice, 20e6, 2000);
        vm.expectEmit(address(vault));
        emit OwnbackVault.Deposited(alice, 20e6 - 2000, 6);
        vault.receiveDeposit(m, "");
        assertEq(vault.free(alice), 20e6 - 2000);
        assertEq(vault.totalAccounted(), 20e6 - 2000);
        assertEq(usdc.balanceOf(address(vault)), 20e6 - 2000);
    }

    function test_U44_receiveDepositRejects() public {
        bytes32 v = bytes32(uint256(uint160(address(vault))));
        bytes32 tm = bytes32(uint256(uint160(address(messenger))));
        bytes memory hook = abi.encode(alice);
        vm.expectRevert(OwnbackVault.UnknownForwarder.selector);
        vault.receiveDeposit(_cctpMsg(6, tm, v, 1e6, bytes32(uint256(0xBAD)), 0, hook), "");
        vm.expectRevert(OwnbackVault.UnknownForwarder.selector);
        vault.receiveDeposit(_cctpMsg(0, tm, v, 1e6, FWD_BASE, 0, hook), "");
        vm.expectRevert(OwnbackVault.BadDeposit.selector);
        vault.receiveDeposit(_cctpMsg(6, tm, bytes32(uint256(0xBEEF)), 1e6, FWD_BASE, 0, hook), "");
        vm.expectRevert(OwnbackVault.BadDeposit.selector);
        vault.receiveDeposit(_cctpMsg(6, bytes32(uint256(0xBEEF)), v, 1e6, FWD_BASE, 0, hook), "");
        transmitter.setOverride(true, 1); // minted amount ≠ amount − fee
        vm.expectRevert(OwnbackVault.BadDeposit.selector);
        vault.receiveDeposit(_depositMsg(alice, 1e6, 0), "");
    }

    // ─── Pause / owner ───────────────────────────────────────────────────────
    function test_U30_U46_pause() public {
        (OwnbackVault.BuyApproval memory a, bytes memory sig) = _ready(5e6);
        vm.prank(keeper);
        vault.execute("b", 5, _order(a, sig, 2e6));
        _fund(alice, 5e6);
        vm.prank(owner);
        vault.pause();

        vm.expectRevert(OwnbackVault.IsPaused.selector);
        _alloc(alice, "p2", APPLE, 1e6);
        vm.prank(keeper);
        vm.expectRevert(OwnbackVault.IsPaused.selector);
        vault.execute("b2", 5, _order(a, sig, 1e6));

        usdc.mint(address(vault), 2e6);
        vm.prank(keeper);
        vault.returnToJar("b", alice, APPLE, 2e6);
        vm.startPrank(alice);
        vault.cancelJar(APPLE);
        vault.cancelApproval(a);
        vault.withdraw(1e6);
        vault.setSolanaRecipient(keccak256("ata"));
        vault.withdrawCrossChain(1e6, 5, 0);
        vm.stopPrank();
        vault.receiveDeposit(_depositMsg(alice, 3e6, 0), "");
        assertEq(vault.free(alice), 5e6 + 5e6 - 2e6 + 3e6);
    }

    function test_U31_U32_U33_timelocksAndOwner() public {
        vm.startPrank(bob);
        vm.expectRevert(OwnbackVault.NotOwner.selector);
        vault.pause();
        vm.expectRevert(OwnbackVault.NotOwner.selector);
        vault.proposeRelay(0, bytes32(uint256(1)));
        vm.expectRevert(OwnbackVault.NotOwner.selector);
        vault.proposeKeeper(bob);
        vm.expectRevert(OwnbackVault.NotOwner.selector);
        vault.proposeForwarder(0, bytes32(uint256(1)));
        vm.expectRevert(OwnbackVault.NotOwner.selector);
        vault.transferOwnership(bob);
        vm.stopPrank();

        vm.startPrank(owner);
        vm.expectRevert(OwnbackVault.NothingPending.selector);
        vault.activateRelay(0);
        vault.proposeRelay(0, bytes32(uint256(7)));
        vault.proposeKeeper(bob);
        vault.proposeForwarder(3, bytes32(uint256(9)));
        skip(48 hours - 1);
        vm.expectRevert(OwnbackVault.TimelockNotReady.selector);
        vault.activateRelay(0);
        vm.expectRevert(OwnbackVault.TimelockNotReady.selector);
        vault.activateKeeper();
        vm.expectRevert(OwnbackVault.TimelockNotReady.selector);
        vault.activateForwarder(3);
        skip(1);
        vault.activateRelay(0);
        vault.activateKeeper();
        vault.activateForwarder(3);
        vm.stopPrank();
        assertEq(vault.relay(0), bytes32(uint256(7)));
        assertEq(vault.keeper(), bob);
        assertEq(vault.forwarder(3), bytes32(uint256(9)));
    }

    function test_U34_twoStepOwnership() public {
        vm.prank(owner);
        vault.transferOwnership(bob);
        vm.prank(alice);
        vm.expectRevert(OwnbackVault.NotOwner.selector);
        vault.acceptOwnership();
        assertEq(vault.owner(), owner);
        vm.prank(bob);
        vault.acceptOwnership();
        assertEq(vault.owner(), bob);
        assertEq(vault.pendingOwner(), address(0));
    }

    // ─── Fuzz ────────────────────────────────────────────────────────────────
    function testFuzz_allocateConservesUserTotal(uint8 n, uint256 seed) public {
        n = uint8(bound(n, 1, 16));
        _rules(alice, type(uint64).max);
        _fund(alice, 5e12);
        bytes32[] memory a = new bytes32[](n);
        uint256[] memory m = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            a[i] = bytes32(uint256(keccak256(abi.encode(seed, i))) >> 8 | (i << 248)); // ascending by top byte
            m[i] = bound(uint256(keccak256(abi.encode(seed, i, "amt"))), 1, 1e12);
        }
        uint256 beforeTotal = vault.free(alice);
        vm.prank(alice);
        try vault.allocate("p", a, m) {} catch {}
        uint256 sum = vault.free(alice);
        for (uint256 i; i < n; ++i) {
            sum += vault.jar(alice, a[i]);
        }
        assertEq(sum, beforeTotal);
    }

    function testFuzz_executeDropsJarsByBurnedTotal(uint256 amt, uint256 take) public {
        amt = bound(amt, 1, MAX_BATCH);
        take = bound(take, 1, amt);
        (OwnbackVault.BuyApproval memory a, bytes memory sig) = _ready(amt);
        uint256 before = usdc.balanceOf(address(vault));
        vm.prank(keeper);
        vault.execute("b", 5, _order(a, sig, take));
        (uint256 burned,,,,,,,) = messenger.last();
        assertEq(burned, take);
        assertEq(vault.jar(alice, APPLE), amt - take);
        assertEq(before - usdc.balanceOf(address(vault)), take);
    }

    function testFuzz_monthIndexMonotonic(uint256 t) public {
        MonthIndexHarness h = new MonthIndexHarness();
        t = bound(t, 0, 10_000_000_000);
        uint32 m0 = h.monthOf(t);
        uint32 m1 = h.monthOf(t + 1);
        assertTrue(m1 == m0 || m1 == m0 + 1);
        if (m1 == m0 + 1) assertEq((t + 1) % 86400, 0); // only changes at midnight
    }
}
