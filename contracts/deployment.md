# Deployment

## Order

1. **Arc Studio (required for the Arc prize).** Create the project, write `OwnbackVault.sol` and its tests there, and run them. Screenshot or record this for the video. Copy the Studio project URL into [docs/09](../docs/09-submission-pack.md).
2. **Spike S2: can Studio deploy to Arc mainnet?**
   - **Yes:** deploy from Studio with the constructor args below.
   - **No:** export the code to `contracts/`, then `forge test`, then deploy with Foundry (step 3). Show both in the video.
3. **Foundry deploy:**
   ```bash
   forge script script/Deploy.s.sol --rpc-url $RPC_ARC --broadcast --verify
   ```
   The deployer is a fresh EOA funded with about $1 USDC for Arc gas. Ownership transfers to `VAULT_OWNER` in the same script.

## Constructor args

| Arg | Value from |
|---|---|
| `usdc` | [chain-config.md](chain-config.md) → Arc USDC (verified) |
| `tokenMessenger` | Arc TokenMessengerV2 (verified) |
| `maxBatchUsd6` | `1_000e6` for the demo |
| `owner` | `VAULT_OWNER` |
| `keeper` | `KEEPER_ADDRESS` (Circle dev wallet on Arc) |
| `messageTransmitter` | Arc MessageTransmitterV2 `0x81D4…4B64` (verified) |
| `relays` | `[(5, RELAY_SOL_USDC_ATA as bytes32), (6, RELAY_BASE as bytes32)]` |
| `forwarders` | `[(0, FWD_ETH), (3, FWD_ARB), (6, FWD_BASE), (5, DEPOSIT_RELAY_SOL)]`. Deploy the forwarders first with a predicted vault address (CREATE2), or set them after deploy with the 48 h timelock |

## After deploy

| ✓ | Step |
|---|---|
| ☐ | Source verified on the Arc explorer |
| ☐ | `owner()`, `keeper()`, `relay(5)`, `relay(6)`, `usdc()`, `tokenMessenger()` read back and match |
| ☐ | `pnpm abi`: ABI copied to `packages/shared/vault-abi.ts`; address set in `chains.ts` (verified ✓) |
| ☐ | Gas Station policy allowlist includes the vault and the three forwarders |
| ☐ | Forwarders verified on Etherscan/Basescan/Arbiscan; `vaultOnArc` and `relayer` read back |
| ☐ | Mainnet smoke tests from [contracts-testing.md](contracts-testing.md#mainnet-smoke-after-deploy-real-money-small) pass |
| ☐ | Address and tx hashes recorded in `docs/tx-log.md` and the README |

## Redeploying

The vault is immutable. If a bug is found:
1. Pause the old vault.
2. Deploy a new one.
3. Point `chains.ts` at it.
4. Users cancel jars and withdraw from the old vault. The app shows a "Move to the new vault" banner with one approval.

Never deploy over a live demo without running the go/no-go checklist again.
