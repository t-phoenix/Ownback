# Chain config

This is the one place every **public** address lives. It becomes `packages/shared/chains.ts` and `packages/shared/assets.ts`.

## Two kinds of address

| Kind | Examples | Where it comes from | In this file? |
|---|---|---|---|
| **Per-user, dynamic** | Each user's EVM and Solana addresses, Solana USDC token account | Created at sign-up (Circle wallet), or derived on the device (seed phrase) → stored in `users` | **No** |
| **Ours, set at deploy** | OwnbackVault, forwarders, keeper, relays, Arkiv writer | Our deploy scripts and accounts | Yes, filled after deploy |
| **Public protocol contracts** | USDC, CCTP, Gateway, token mints | Circle / Arc / issuers | Yes, **verified** |

## How "verified" works (the ✓ column)

A value gets ✓ only when **three independent sources agree**:
1. the official docs (Circle / Arc / issuer)
2. an independent index (block explorer label, CoinGecko)
3. **the chain itself**: we call the contract and check `symbol()`, `decimals()`, `localDomain()` or that program code exists

In `chains.ts` each value is `{ value, verified: true|false }`. The app refuses to start in the `demo` environment if any value it uses is `verified: false`. CI runs `pnpm verify:chain`, which re-does check 3 on every build. Ticking means setting `verified: true` in `chains.ts` and ✓ here, in the same PR, with the evidence in the PR description.

**Run on 6 Nov.** Sources:
- (1) developers.circle.com (USDC addresses, CCTP EVM contracts, CCTP Solana programs, Gateway addresses) and docs.arc.io (contract addresses, RPC endpoints)
- (2) etherscan.io, arbiscan.io and the CoinGecko `usd-coin` platforms list (basescan and solscan returned 403, so for those CoinGecko was the second source)
- (3) live RPC calls to Arc, Ethereum, Base, Arbitrum and Solana mainnet

## Chains

| Key | Chain ID | CCTP domain | RPC (public) | Explorer | ✓ |
|---|---|---|---|---|---|
| `arc` | **5042** | 26 | `https://rpc.mainnet.arc.io` (+ Alchemy, Blockdaemon, dRPC, QuickNode) | `https://explorer.arc.io` | ✓ chain ID read on-chain; `localDomain()` = 26 |
| `ethereum` | 1 | 0 | own provider | `https://etherscan.io` | ✓ `localDomain()` = 0 |
| `base` | 8453 | 6 | own provider | `https://basescan.org` | ✓ `localDomain()` = 6 |
| `arbitrum` | 42161 | 3 | own provider | `https://arbiscan.io` | ✓ `localDomain()` = 3 |
| `solana` | — | 5 | Helius or similar | `https://solscan.io` | ✓ |
| `bnb` | 56 | none (no CCTP) | own provider | `https://bscscan.com` | Venue only, behind a flag (Q5) |

Arc facts from docs.arc.io:
- Finality is deterministic and under 1 second, so no confirmation count is needed.
- The minimum base fee is 20 gwei.
- Native USDC gas uses 18 decimals, and the ERC-20 interface uses 6. They're the same balance.
- viem exports the chain as `arc`.

## USDC (Circle-issued)

| Chain | Address / mint | Decimals | ✓ |
|---|---|---|---|
| Arc | `0x3600000000000000000000000000000000000000` | 6 (ERC-20 interface) | ✓ Circle docs + Arc docs + CoinGecko + on-chain `symbol()` = USDC, `decimals()` = 6 |
| Ethereum | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | 6 | ✓ Circle + Etherscan ("Circle", verified FiatTokenProxy) + CoinGecko + on-chain |
| Base | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 6 | ✓ Circle + CoinGecko + on-chain |
| Arbitrum | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | 6 | ✓ Circle + Arbiscan ("Native USDC by Circle") + CoinGecko + on-chain |
| Solana | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 6 | ✓ Circle + CoinGecko + on-chain (SPL Token mint, decimals 6) |
| BNB | **Not issued by Circle** (absent from Circle's list and CoinGecko's USDC platforms) | — | ✗ Don't treat any BNB "USDC" as USDC (A19) |

## CCTP V2

| Contract | Address | Chains | ✓ |
|---|---|---|---|
| TokenMessengerV2 | `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d` | Arc, Ethereum, Base, Arbitrum | ✓ Circle + Arc docs + Etherscan ("Circle CCTP: Token Messenger V2") + code on all 4 |
| MessageTransmitterV2 | `0x81D40F21F12A8F0E3252Bccb954D722d4c464B64` | same | ✓ Circle + Arc docs + Etherscan + `localDomain()` matches on all 4 |
| TokenMinterV2 | `0xfd78EE919681417d192449715b2594ab58f5D002` | same | Circle + Arc docs (not called directly) |
| MessageV2 | `0xec546b6B005471ECf012e5aF77FBeC07e0FD8f78` | same | Circle + Arc docs (not called directly) |
| Solana MessageTransmitterV2 | `CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC` | Solana | ✓ Circle (program table) + on-chain executable program. Note: Circle's page has the two IDL links swapped; trust the program table |
| Solana TokenMessengerMinterV2 | `CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe` | Solana | ✓ Circle + on-chain executable program |
| Attestation API (Iris) | `https://iris-api.circle.com` (`GET /v2/messages/{sourceDomain}?transactionHash=…`, 40 req/s) | — | Circle docs |

## Gateway (optional, S5)

| Contract | Address | ✓ |
|---|---|---|
| GatewayWallet | `0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE` (Arc, Ethereum, Base, Arbitrum…) | ✓ Circle + Arc docs + Etherscan ("Circle: Gateway Wallet") + code on all 4 |
| GatewayMinter | `0x2222222d7164433c4C09B0b0D809a9b52C04C205` | ✓ Circle + Arc docs + code on all 4. Etherscan has no label, but its source files are GatewayMinter.sol |
| Gateway on Solana mainnet | **Not published** (devnet only) | ✗ |
| Gateway API base URL | **Not found in the docs we read** | ✗ (S5) |

## Ours (fill after deploy, then verify on-chain)

| Name | Value | Set when |
|---|---|---|
| OwnbackVault (Arc) | — | [deployment.md](deployment.md) |
| OwnbackDepositForwarder (Ethereum, Base, Arbitrum) | — | Same; constructor takes the vault address |
| Vault owner (Safe if on Arc, S16) | — | Before deploy |
| Keeper (Circle dev wallet, Arc) | — | Accounts checklist |
| Relayer (Circle dev wallet, Ethereum/Base/Arbitrum) | — | Accounts checklist |
| Solana relay: owner / USDC ATA | — / — | Before deploy |
| Solana deposit relay (A15) | — | Before deploy |
| Base relay (also the BNB route) | — | Before deploy |
| Arkiv writer (registry) / keeper writer (proofs) | — / — | Accounts checklist |

## Assets (`packages/shared/assets.ts`, the second source for the A1 two-source rule)

Mints come **only** from the issuer's official list, then are checked on-chain (decimals, mint authority = issuer) and imported to Arkiv. Each needs all three sources before ✓.

| Slug | Display | Class | Token | Venue options (Q5) | Mint | ✓ |
|---|---|---|---|---|---|---|
| `co:apple` | Apple | stock | AAPLx / AAPLc / AAPLon | Solana · Base · Ethereum | ☐ | ☐ |
| `co:tsmc` | TSMC | stock | ☐ | ☐ | ☐ | ☐ (S9) |
| `co:qualcomm` | Qualcomm | stock | ☐ | ☐ | ☐ | ☐ (S9) |
| `co:corning` | Corning | stock | ☐ | Base | ☐ | ☐ (S9, S15) |
| `co:unilever` · `co:nike` · `co:cocacola` · `co:pepsico` · `co:levi` | — | stock | ☐ | ☐ | ☐ | ☐ |
| `mat:gold` | Gold | commodity | GLDx / PAXG / XAUt | Solana · Ethereum | ☐ | ☐ |
| `mat:silver` | Silver | commodity | SLVon | Ethereum | ☐ | ☐ |
| `idx:sp500` · `idx:nasdaq100` | S&P 500 · Nasdaq 100 | index | SPYx · QQQx | Solana | ☐ | ☐ |
| `crypto:btc` · `crypto:eth` | Bitcoin · Ether | crypto | ☐ | ☐ | ☐ | ☐ |
| `idx:tbills` | US T-bills | yield | USDY | Solana (non-US only) | ☐ | ☐ |

DexScreener shows fake PAXG/XAUt pools on Solana. Never copy a mint from a DEX.

## `chains.ts` shape

```ts
type V = { value: string; verified: boolean; evidence: string };
export const CHAINS = {
  arc: { chainId: 5042, cctpDomain: 26, usdc: v('0x3600000000000000000000000000000000000000', true, 'circle+arc+coingecko+onchain 2026-11-06'), /* … */ },
} as const;
// start-up: if (env === 'demo') assertAllVerified(CHAINS, ASSETS)
// CI: pnpm verify:chain → re-reads symbol/decimals/localDomain/code for every verified value
```
