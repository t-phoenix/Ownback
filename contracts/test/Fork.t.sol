// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {OwnbackVault} from "../src/OwnbackVault.sol";
import {ITokenMessengerV2} from "../src/interfaces/ITokenMessengerV2.sol";
import {IMessageTransmitterV2} from "../src/interfaces/IMessageTransmitterV2.sol";

/// Arc mainnet fork checks (contracts-testing.md F1 wiring).
/// Run: forge test --match-path test/Fork.t.sol --fork-url $RPC_ARC
///
/// shortcut: Arc USDC (0x3600…→precompile 0x18…) is not forge-emulatable — transfer/deposit
/// smoke must run live on Arc testnet/mainnet, not via `deal`/`prank` transfer.
contract ForkTest is Test {
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;
    address constant TOKEN_MESSENGER_V2 = 0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d;
    address constant MESSAGE_TRANSMITTER_V2 = 0x81D40F21F12A8F0E3252Bccb954D722d4c464B64;

    OwnbackVault vault;
    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    bytes32 constant RELAY_SOL = bytes32(uint256(1));

    function setUp() public {
        if (block.chainid != 5042) return;

        OwnbackVault.DomainValue[] memory relays = new OwnbackVault.DomainValue[](1);
        relays[0] = OwnbackVault.DomainValue(5, RELAY_SOL);
        OwnbackVault.DomainValue[] memory fwds = new OwnbackVault.DomainValue[](0);

        vault = new OwnbackVault(
            IERC20(ARC_USDC),
            ITokenMessengerV2(TOKEN_MESSENGER_V2),
            IMessageTransmitterV2(MESSAGE_TRANSMITTER_V2),
            1_000e6,
            owner,
            keeper,
            relays,
            fwds
        );
    }

    modifier mainnetFork() {
        if (block.chainid != 5042) return;
        _;
    }

    /// F1 (partial): deploy against real Arc USDC + CCTP; read back immutables / protocol views.
    function test_F1_deployAgainstRealUsdcAndCctp() public mainnetFork {
        assertEq(IERC20Metadata(ARC_USDC).symbol(), "USDC");
        assertEq(IERC20Metadata(ARC_USDC).decimals(), 6);

        (bool okDom, bytes memory dom) =
            MESSAGE_TRANSMITTER_V2.staticcall(abi.encodeWithSignature("localDomain()"));
        assertTrue(okDom);
        assertEq(abi.decode(dom, (uint32)), 26);

        (bool ok, bytes memory ret) =
            TOKEN_MESSENGER_V2.staticcall(abi.encodeWithSignature("localMessageTransmitter()"));
        assertTrue(ok);
        assertEq(abi.decode(ret, (address)), MESSAGE_TRANSMITTER_V2);

        assertEq(address(vault.usdc()), ARC_USDC);
        assertEq(address(vault.tokenMessenger()), TOKEN_MESSENGER_V2);
        assertEq(address(vault.messageTransmitter()), MESSAGE_TRANSMITTER_V2);
        assertEq(vault.owner(), owner);
        assertEq(vault.keeper(), keeper);
        assertEq(vault.maxBatchUsd6(), 1_000e6);
        assertEq(vault.relay(5), RELAY_SOL);
        assertGt(ARC_USDC.code.length, 0);
        assertGt(TOKEN_MESSENGER_V2.code.length, 0);
        assertGt(MESSAGE_TRANSMITTER_V2.code.length, 0);
    }
}
