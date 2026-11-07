// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {OwnbackVault} from "../src/OwnbackVault.sol";

/// Tiny Arc smoke: setRules + deposit + allocate to co:apple.
/// Amount from env SMOKE_USD6 (micro-USDC). Example: 300000 = $0.30
///   forge script script/SmokeUser.s.sol --rpc-url $RPC_ARC --broadcast --private-key $TEST_USER_PRIVATE_KEY
contract SmokeUser is Script {
    bytes32 constant APPLE = keccak256("co:apple");
    bytes32 constant FALLBACK = keccak256("idx:sp500");

    function run() external {
        require(block.chainid == 5042, "not Arc mainnet");
        OwnbackVault vault = OwnbackVault(vm.envAddress("VAULT_ADDRESS"));
        IERC20 usdc = vault.usdc();
        uint256 amount = vm.envUint("SMOKE_USD6"); // e.g. 300000
        require(amount > 0 && amount <= 1e6, "smoke 0..$1 only");

        vm.startBroadcast();
        vault.setRules(OwnbackVault.Rules(500, 50e6, FALLBACK)); // 5%, $50 monthly
        usdc.approve(address(vault), amount);
        vault.deposit(amount);
        bytes32[] memory assets = new bytes32[](1);
        assets[0] = APPLE;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        vault.allocate(keccak256("smoke-apple-1"), assets, amounts);
        vm.stopBroadcast();
    }
}
