// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {VaultFixture} from "./Base.t.sol";
import {OwnbackVault} from "../src/OwnbackVault.sol";
import {MockUSDC, MockTokenMessenger} from "./mocks/Mocks.sol";

contract Handler is Test {
    OwnbackVault vault;
    MockUSDC usdc;
    MockTokenMessenger messenger;
    address keeper;
    bytes32[2] public assets = [keccak256("co:apple"), keccak256("mat:gold")];
    address[3] public users;
    uint256[3] pks;
    uint256 nonce;
    bytes32[] public batches;

    // ghosts
    uint256 public ghostBurnedByExecute;
    uint256 public ghostExecuted;
    mapping(bytes32 => mapping(address => mapping(bytes32 => uint256))) public ghostReturned;
    mapping(bytes32 => mapping(address => mapping(bytes32 => uint256))) public ghostExecutedIn;

    constructor(OwnbackVault v, MockUSDC u, MockTokenMessenger m, address k) {
        vault = v;
        usdc = u;
        messenger = m;
        keeper = k;
        for (uint256 i; i < 3; ++i) {
            (users[i], pks[i]) = makeAddrAndKey(string(abi.encode("user", i)));
            vm.prank(users[i]);
            vault.setRules(OwnbackVault.Rules(500, 500e6, assets[0]));
        }
    }

    function _u(uint256 s) internal view returns (address, uint256) {
        uint256 i = s % 3;
        return (users[i], pks[i]);
    }

    function deposit(uint256 s, uint256 amt) external {
        (address u,) = _u(s);
        amt = bound(amt, 1, 200e6);
        usdc.mint(u, amt);
        vm.startPrank(u);
        usdc.approve(address(vault), amt);
        vault.deposit(amt);
        vm.stopPrank();
    }

    function allocate(uint256 s, uint256 a0, uint256 a1) external {
        (address u,) = _u(s);
        bytes32[] memory a = new bytes32[](2);
        (a[0], a[1]) = assets[0] < assets[1] ? (assets[0], assets[1]) : (assets[1], assets[0]);
        uint256[] memory m = new uint256[](2);
        m[0] = bound(a0, 1, 50e6);
        m[1] = bound(a1, 1, 50e6);
        vm.prank(u);
        try vault.allocate(keccak256(abi.encode(nonce++)), a, m) {} catch {}
    }

    function cancelJar(uint256 s, uint256 ai) external {
        (address u,) = _u(s);
        vm.prank(u);
        try vault.cancelJar(assets[ai % 2]) {} catch {}
    }

    function withdraw(uint256 s, uint256 amt) external {
        (address u,) = _u(s);
        uint256 f = vault.free(u);
        if (f == 0) return;
        vm.prank(u);
        vault.withdraw(bound(amt, 1, f));
    }

    function execute(uint256 s, uint256 ai, uint256 amt) external {
        (address u, uint256 pk) = _u(s);
        bytes32 asset = assets[ai % 2];
        uint256 j = vault.jar(u, asset);
        if (j == 0) return;
        amt = bound(amt, 1, j > 1_000e6 ? 1_000e6 : j);
        OwnbackVault.BuyApproval memory a;
        a.user = u;
        a.items = new OwnbackVault.Item[](1);
        a.items[0] = OwnbackVault.Item(asset, amt, 5, 1e6);
        a.nonce = nonce++;
        a.deadline = uint64(block.timestamp + 30 minutes);
        (uint8 v, bytes32 r, bytes32 ss) = vm.sign(pk, vault.hashApproval(a));
        OwnbackVault.Order[] memory o = new OwnbackVault.Order[](1);
        uint256[] memory idx = new uint256[](1);
        uint256[] memory am = new uint256[](1);
        am[0] = amt;
        o[0] = OwnbackVault.Order(a, abi.encodePacked(r, ss, v), idx, am);
        bytes32 b = keccak256(abi.encode("batch", nonce++));
        uint256 burnsBefore = messenger.burns();
        vm.prank(keeper);
        vault.execute(b, 5, o);
        assertEq(messenger.burns(), burnsBefore + 1);
        (uint256 burned,,,,,,,) = messenger.last();
        ghostBurnedByExecute += burned;
        ghostExecuted += amt;
        ghostExecutedIn[b][u][asset] += amt;
        batches.push(b);
    }

    function mintBackAndReturn(uint256 bi, uint256 s, uint256 ai, uint256 amt) external {
        if (batches.length == 0) return;
        bytes32 b = batches[bi % batches.length];
        (address u,) = _u(s);
        bytes32 asset = assets[ai % 2];
        uint256 left = vault.executedIn(b, u, asset);
        if (left == 0) return;
        amt = bound(amt, 1, left);
        usdc.mint(address(vault), amt);
        vm.prank(keeper);
        vault.returnToJar(b, u, asset, amt);
        ghostReturned[b][u][asset] += amt;
    }

    function warp(uint256 secs) external {
        skip(bound(secs, 1, 20 days));
    }

    function sumAccounts() external view returns (uint256 sum) {
        for (uint256 i; i < 3; ++i) {
            sum += vault.free(users[i]);
            for (uint256 k; k < 2; ++k) {
                sum += vault.jar(users[i], assets[k]);
            }
        }
    }

    function batchCount() external view returns (uint256) {
        return batches.length;
    }
}

contract InvariantsTest is VaultFixture {
    Handler h;

    function setUp() public override {
        super.setUp();
        h = new Handler(vault, usdc, messenger, keeper);
        targetContract(address(h));
    }

    /// I1
    function invariant_I1_accounting() public view {
        assertEq(vault.totalAccounted(), h.sumAccounts());
        assertGe(usdc.balanceOf(address(vault)), vault.totalAccounted());
    }

    /// I4 (amount side): every burned dollar was an approved, executed jar dollar.
    function invariant_I4_burnsMatchExecuted() public view {
        assertEq(h.ghostBurnedByExecute(), h.ghostExecuted());
    }

    /// I5
    function invariant_I5_monthlyCap() public view {
        uint32 m = vault.currentMonth();
        for (uint256 i; i < 3; ++i) {
            (, uint64 cap,) = vault.rules(h.users(i));
            assertLe(vault.spentInMonth(h.users(i), m), cap);
        }
    }

    /// I7
    function invariant_I7_returnsCapped() public view {
        uint256 n = h.batchCount();
        for (uint256 b; b < n; ++b) {
            bytes32 id = h.batches(b);
            for (uint256 i; i < 3; ++i) {
                for (uint256 k; k < 2; ++k) {
                    address u = h.users(i);
                    bytes32 a = h.assets(k);
                    assertLe(h.ghostReturned(id, u, a), h.ghostExecutedIn(id, u, a));
                    assertEq(vault.executedIn(id, u, a), h.ghostExecutedIn(id, u, a) - h.ghostReturned(id, u, a));
                }
            }
        }
    }
}
