# Contracts

Two contracts:

- **OwnbackVault** on Arc mainnet. It holds each user's free USDC and per-asset jars, and enforces their rules and monthly limit (no per-asset max). Only with the user's signed BuyApproval (or S20 `approveBuy`) does it send jar money to a fixed venue relay through CCTP. Users withdraw only to their own address.
- **OwnbackDepositForwarder** on Ethereum, Base and Arbitrum. With the user's one-time allowance, it moves their USDC only into their own vault balance (auto-add, Q3).

| Doc | What it's for |
|---|---|
| [vault-spec.md](vault-spec.md) | Storage, functions, events, errors, invariants. **The ABI freezes Fri 01:00** |
| [chain-config.md](chain-config.md) | Every chain ID, CCTP domain and contract address → `packages/shared/chains.ts` |
| [contracts-testing.md](contracts-testing.md) | Foundry unit, fuzz, invariant and fork tests |
| [contracts-security.md](contracts-security.md) | Threats, access control, pre-deploy checklist |
| [deployment.md](deployment.md) | Arc Studio → mainnet, Foundry fallback, post-deploy checks |

Read [docs/03](../docs/03-decisions-and-open-questions.md) (Q1, Q3, Q7) and [docs/10](../docs/10-security-audit.md) (A2, A5, A6, A14) first.

## Build and test

```bash
cd contracts && forge build && forge test
```

Dependencies are vendored in `lib/` (forge-std v1.11.0, OpenZeppelin v5.4.0), not git submodules.

## Layout

```
contracts/
  foundry.toml
  src/OwnbackVault.sol
  src/lib/MonthIndex.sol         UTC calendar month from a timestamp
  src/OwnbackDepositForwarder.sol
  src/interfaces/ITokenMessengerV2.sol, IMessageTransmitterV2.sol
  test/OwnbackVault.t.sol        unit + fuzz
  test/Invariants.t.sol
  test/OwnbackDepositForwarder.t.sol
  test/Fork.t.sol                Anvil fork of Arc mainnet (not written yet)
  script/Deploy.s.sol
```

After `forge build`, `pnpm abi` copies `out/OwnbackVault.sol/OwnbackVault.json` into `packages/shared/vault-abi.ts`, so the backend and frontend always use the built ABI.
