// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {OwnbackVault} from "../src/OwnbackVault.sol";

/// Arc buy smoke: setSolanaRecipient (once) → approveBuy (S20) → keeper execute → CCTP domain 5.
/// Env: VAULT_ADDRESS, SMOKE_USD6 (≤ jar), SMOKE_SOL_USDC_ATA (bytes32 hex of user's Solana USDC ATA),
///      TEST_USER_PRIVATE_KEY, KEEPER_PRIVATE_KEY (or --private-key for both via multi-key broadcast).
/// Run:
///   forge script script/SmokeBuy.s.sol --rpc-url $RPC_ARC --broadcast \
///     --private-key $TEST_USER_PRIVATE_KEY --private-key $KEEPER_PRIVATE_KEY
contract SmokeBuy is Script {
    bytes32 constant APPLE = keccak256("co:apple");
    uint32 constant SOLANA = 5;

    function run() external {
        require(block.chainid == 5042, "not Arc mainnet");
        OwnbackVault vault = OwnbackVault(vm.envAddress("VAULT_ADDRESS"));
        uint256 amount = vm.envUint("SMOKE_USD6");
        bytes32 userAta = vm.envBytes32("SMOKE_SOL_USDC_ATA");
        require(amount > 0 && amount <= 1e6, "smoke 0..$1 only");
        require(userAta != bytes32(0), "need SMOKE_SOL_USDC_ATA");

        uint256 userPk = vm.envUint("TEST_USER_PRIVATE_KEY");
        uint256 keeperPk = vm.envUint("KEEPER_PRIVATE_KEY");
        address user = vm.addr(userPk);

        uint256 jarBal = vault.jar(user, APPLE);
        require(jarBal >= amount, "jar too small");

        // ── User: Solana recipient (USDC ATA) + on-chain BuyApproval ─────────
        vm.startBroadcast(userPk);
        if (vault.solanaRecipient(user) == bytes32(0)) {
            vault.setSolanaRecipient(userAta);
            console2.log("setSolanaRecipient");
        }
        OwnbackVault.BuyApproval memory a;
        a.user = user;
        a.items = new OwnbackVault.Item[](1);
        // maxPrice: ~$400/AAPLx (8 decimals) with headroom for smoke
        a.items[0] = OwnbackVault.Item(APPLE, amount, SOLANA, 400e6);
        a.maxFeeUsd6 = (amount * 500) / 10_000; // 5%
        a.nonce = uint256(keccak256(abi.encode("smoke-buy", block.timestamp)));
        a.deadline = uint64(block.timestamp + 1 hours);
        vault.approveBuy(a);
        console2.log("approveBuy hash");
        console2.logBytes32(vault.hashApproval(a));
        vm.stopBroadcast();

        // ── Keeper: execute → CCTP burn to relay ATA ─────────────────────────
        bytes32 batchId = keccak256(abi.encode("smoke-batch", block.timestamp, user, amount));
        OwnbackVault.Order[] memory orders = new OwnbackVault.Order[](1);
        orders[0].approval = a;
        orders[0].signature = ""; // S20 onchainApproval
        orders[0].itemIndex = new uint256[](1);
        orders[0].amounts = new uint256[](1);
        orders[0].itemIndex[0] = 0;
        orders[0].amounts[0] = amount;

        vm.startBroadcast(keeperPk);
        vault.execute(batchId, SOLANA, orders);
        console2.log("execute batchId");
        console2.logBytes32(batchId);
        vm.stopBroadcast();
    }
}
