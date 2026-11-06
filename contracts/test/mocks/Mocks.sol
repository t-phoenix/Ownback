// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract MockUSDC is ERC20("USD Coin", "USDC") {
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

/// Records the last burn and pulls the USDC like the real messenger does.
contract MockTokenMessenger {
    struct Burn {
        uint256 amount;
        uint32 domain;
        bytes32 mintRecipient;
        address burnToken;
        bytes32 destinationCaller;
        uint256 maxFee;
        uint32 minFinality;
        bytes hookData;
    }

    Burn public last;
    uint256 public burns;

    function depositForBurn(uint256 a, uint32 d, bytes32 r, address t, bytes32 c, uint256 f, uint32 m) external {
        _burn(a, d, r, t, c, f, m, "");
    }

    function depositForBurnWithHook(
        uint256 a,
        uint32 d,
        bytes32 r,
        address t,
        bytes32 c,
        uint256 f,
        uint32 m,
        bytes calldata h
    ) external {
        _burn(a, d, r, t, c, f, m, h);
    }

    function _burn(uint256 a, uint32 d, bytes32 r, address t, bytes32 c, uint256 f, uint32 m, bytes memory h) internal {
        require(a > 0, "zero");
        ERC20(t).transferFrom(msg.sender, address(0xdead), a);
        last = Burn(a, d, r, t, c, f, m, h);
        burns++;
    }

    function lastHookData() external view returns (bytes memory) {
        return last.hookData;
    }
}

/// Mints `amount - feeExecuted` (or `mintOverride`) to the body's mintRecipient; enforces destinationCaller.
contract MockMessageTransmitter {
    MockUSDC public immutable usdc;
    bool public useOverride;
    uint256 public mintOverride;

    constructor(MockUSDC u) {
        usdc = u;
    }

    function setOverride(bool on, uint256 amt) external {
        useOverride = on;
        mintOverride = amt;
    }

    function receiveMessage(bytes calldata m, bytes calldata) external returns (bool) {
        bytes32 caller = bytes32(m[108:140]);
        require(caller == bytes32(0) || caller == bytes32(uint256(uint160(msg.sender))), "caller");
        bytes calldata body = m[148:];
        address to = address(uint160(uint256(bytes32(body[36:68]))));
        uint256 amount = uint256(bytes32(body[68:100]));
        uint256 fee = uint256(bytes32(body[164:196]));
        uint256 mintAmt = useOverride ? mintOverride : amount - fee;
        if (mintAmt > 0) usdc.mint(to, mintAmt);
        return true;
    }
}

/// ERC-1271 smart account owned by an EOA signer.
contract MockSmartAccount is IERC1271 {
    address public signer;
    bool public broken;

    constructor(address s) {
        signer = s;
    }

    function setBroken(bool b) external {
        broken = b;
    }

    function isValidSignature(bytes32 h, bytes calldata sig) external view returns (bytes4) {
        if (broken) return 0xdeadbeef;
        (address rec,,) = ECDSA.tryRecover(h, sig);
        return rec == signer ? IERC1271.isValidSignature.selector : bytes4(0xffffffff);
    }
}
