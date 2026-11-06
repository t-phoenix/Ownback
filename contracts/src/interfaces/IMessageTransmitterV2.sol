// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Circle CCTP V2 MessageTransmitterV2 (subset we call).
interface IMessageTransmitterV2 {
    function receiveMessage(bytes calldata message, bytes calldata attestation) external returns (bool success);
}
