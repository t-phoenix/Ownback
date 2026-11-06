// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {OwnbackVault} from "../src/OwnbackVault.sol";
import {ITokenMessengerV2} from "../src/interfaces/ITokenMessengerV2.sol";
import {IMessageTransmitterV2} from "../src/interfaces/IMessageTransmitterV2.sol";

/// Arc mainnet vault deploy. Addresses: contracts/chain-config.md (✓ verified only).
/// forge script script/Deploy.s.sol --rpc-url $RPC_ARC --broadcast --verify
contract Deploy is Script {
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;
    address constant TOKEN_MESSENGER_V2 = 0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d;
    address constant MESSAGE_TRANSMITTER_V2 = 0x81D40F21F12A8F0E3252Bccb954D722d4c464B64;
    uint256 constant MAX_BATCH_USD6 = 1_000e6;

    function run() external returns (OwnbackVault vault) {
        require(block.chainid == 5042, "not Arc mainnet");
        OwnbackVault.DomainValue[] memory relays = new OwnbackVault.DomainValue[](2);
        relays[0] = OwnbackVault.DomainValue(5, vm.envBytes32("RELAY_SOL_USDC_ATA"));
        relays[1] = OwnbackVault.DomainValue(6, _b32(vm.envAddress("RELAY_BASE")));
        OwnbackVault.DomainValue[] memory fwds = new OwnbackVault.DomainValue[](4);
        fwds[0] = OwnbackVault.DomainValue(0, _b32(vm.envAddress("FWD_ETH")));
        fwds[1] = OwnbackVault.DomainValue(3, _b32(vm.envAddress("FWD_ARB")));
        fwds[2] = OwnbackVault.DomainValue(6, _b32(vm.envAddress("FWD_BASE")));
        fwds[3] = OwnbackVault.DomainValue(5, vm.envBytes32("DEPOSIT_RELAY_SOL"));

        vm.startBroadcast();
        vault = new OwnbackVault(
            IERC20(ARC_USDC),
            ITokenMessengerV2(TOKEN_MESSENGER_V2),
            IMessageTransmitterV2(MESSAGE_TRANSMITTER_V2),
            MAX_BATCH_USD6,
            vm.envAddress("VAULT_OWNER"),
            vm.envAddress("KEEPER_ADDRESS"),
            relays,
            fwds
        );
        vm.stopBroadcast();
    }

    function _b32(address a) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(a)));
    }
}
