# Transaction log (mainnet)

Never put private keys here. Addresses and tx hashes only.

## OwnbackVault (Arc mainnet, chain 5042)

| Field | Value |
|---|---|
| Address | `0x273104299Bb7795aC06ef1cAac59C88E3EFEB864` |
| Deploy tx | `0x486f2af3ae33a70ca3f20b1b5dd5bbf063e1a2e6571d9f8d420c79f21684c10c` |
| Explorer | https://explorer.arc.io/address/0x273104299Bb7795aC06ef1cAac59C88E3EFEB864 |
| Deployer | `0xfA4b240a43f115E41C6f4651A8630AD93D88E8A1` |
| Owner | `0xc4f6AF754e6fE59BECaAbddF111eA27c53100Dd2` |
| Keeper | `0x2326b2eb6114A90d35889a7AdF9eDE1Dc18Db3FE` |
| Gas used | `3,539,073` (~0x361481) |
| Effective gas price | ~25.7 gwei (`0x5fed1d180`) |
| **Deploy gas cost** | **≈ $0.091 USDC** (native 18-dec gas) |
| Arc Studio | https://studio.arc.io/app/78eb1392-b397-4a27-b8bf-00a26e6134ba |

Constructor (verified ✓ from chain-config):

- USDC `0x3600…0000`
- TokenMessengerV2 `0x28b5…cf5d`
- MessageTransmitterV2 `0x81D4…4B64`
- maxBatchUsd6 `1_000e6`
- relay(5) = Solana buy-relay USDC ATA bytes32
- relay(6) = Base relay EOA
- forwarders = zero (timelock later)

## Smoke / fee notes

Filled as test_user runs complete.

## Smoke · test_user Arc path (2026-11-07)

User: `0x85B4041E74c1B9FEd1AcD5Ff627490CD4fCf8A29`  
Vault: `0x273104299Bb7795aC06ef1cAac59C88E3EFEB864`  
Notional: **$0.30** into `co:apple` jar.

### A · Deposit / allocate

| Step | Tx | Gas | ≈ USDC gas |
|---|---|---|---|
| setRules | `0xafc064d4…412070` | 70,115 | ~0.0018 |
| approve USDC | `0x26f3f4ce…394634` | 55,438 | ~0.0014 |
| deposit $0.30 | `0x5253ba11…91284f` | 100,125 | ~0.0026 |
| allocate → apple jar | `0x44c44964…031d9b` | 102,148 | ~0.0026 |
| **Subtotal A** | | **327,826** | **≈ $0.0084** |

### B · Buy → CCTP → Jupiter AAPLx (first smoke user — completed)

Solana user: `6yMWiXkXPY6AMcyZdqBK1PoBCTniLgRd89oRN67gC9bH`  
AAPLx ATA (Token-2022): `EbC8SMEadnMKvbWwYzNj61gUuMQ8N8Uavfb85Q2aXks6`  
Buy relay: `DakifiCe43yFhZTctiAEMh4bRT7ZYwFJbBC7fMsMARwN` / USDC ATA `6bB9…`

| Step | Who pays | Tx / sig | Cost |
|---|---|---|---|
| setSolanaRecipient | test_user Arc gas | `0x006d031e776e5fac6633523190bff6db551d54afb92b7a40e8e4dd0e0b899135` | gas 46,775 ≈ **$0.00094** |
| approveBuy (S20) | test_user Arc gas | `0x3db3fc2f182f9be8187ca8b9c0ee0964f1897315c1ff5ec5c8da13728ca8a06a` | gas 53,508 ≈ **$0.00107** |
| keeper execute + CCTP burn $0.30 → domain 5 | keeper Arc gas + jar USDC | `0xaaed8eae7f9a9e841c4c748350aa98cb2a0b6b2e37c6097f9d04f24fea88fd39` | gas 226,948 ≈ **$0.00454**; **$0.30** burned (Iris `feeExecuted=0`) |
| Solana receiveMessage | relay SOL | `5xixcS94Kf2cdi8KUvLhVgq1PVBz9oEeWkv4KjKkQmBLCSiCKbMNHkUgJgpucdxRJLsWa8QTpxzd2Xc4VtBGz5ah` | ≈ **0.00070 SOL** |
| create AAPLx ATA (Token-2022) | relay SOL | `3dDsqXLbbhFaxeVKT6V7Np3JNJTpiyDoD88beqZRbWujMYDuPtBBoJcWZknjB7TCynbMTnKfP97LwchFbyzfooiM` | ≈ **0.00167 SOL** (rent) |
| Jupiter USDC→AAPLx ($0.30) | relay SOL + $0.30 USDC | `sEW7amct4hrrt8aPJEhfanACkkTnRse6oxipiFmbC7L8F4dZugi28CkWz9MfGFHpov1vgYeNxp7buG7iq8BdSVG` | ≈ **0.00166 SOL**; out **86,184** raw AAPLx (8 dec) |

**Spend totals (this buy leg B)**

| Bucket | Amount |
|---|---|
| Arc gas (user) | ≈ **$0.00201** |
| Arc gas (keeper) | ≈ **$0.00454** |
| Jar USDC → Solana | **$0.30** (CCTP fee $0) |
| Relay SOL (was 0.08) | **≈ 0.00404 SOL** spent → **0.07596 SOL** left |
| Relay USDC left | **$0.01** (pre-existing buffer) |
| User AAPLx | **0.00086184** (raw 86184; UI may show scaled) |

**Gotchas recorded**

- Forge cannot simulate Arc USDC precompile — use `cast` / viem against live RPC (`--skip-simulation` still local-executes).
- AAPLx mint is **Token-2022** (`Tokenz…`); ATA ≠ classic `AdEeiu…` (that was Tokenkeg-derived). Correct ATA = `EbC8…`.
- `solanaRecipient` was first set wrong (`BiFw…` / `0x9f26…`). **D28 fix proposed** 2026-11-07: `setSolanaRecipient` → pending USDC ATA of `6yMW…` = `7dq67…` / `0x6295676f…` — tx `0x136f9b7e578d5fd6ab825480353d82a8412d7188154451a6e59fedd2dc6a9c62`, activate after eta **1794186443** (~48h). Buys do not use `solanaRecipient`.
- Alchemy Solana HTTP has no `signatureSubscribe` — poll `getSignatureStatuses`.
- Scripts: `scripts/smoke/arc-buy.ts`, `scripts/smoke/sol-receive-swap.ts`, `contracts/script/SmokeBuy.s.sol` (forge dry-run only).

### C · Demo user (fresh EOA — correct `setSolanaRecipient` first-set) · 2026-11-07

| Role | Address |
|---|---|
| Arc EOA | `0xB7c86Df940FfC3CCF45c0317611d2D9Eef000448` |
| Solana wallet | `DUjBeocZjZxPnUy7v9LSAinKmue5qr4bfaBD9ewBUG5T` |
| USDC ATA (vault recipient) | `AtuGpxxwMXXNjmRvQ6cVLG8VQvBAyeZ9J295W53uHppL` (`0x9304e8a2…`) |
| AAPLx ATA (Token-2022) | `5fuANVK3gW9LwaCUFupAAZoR5pkReGFf8vKG1ciW5tx7` |

Funded from old test_user: USDC transfer `0xc128f93d…` + gas `0x7796b6b9…`.

| Step | Tx / sig |
|---|---|
| setRules | `0x2b283639130268ccfbfd1b6c2e20c705ed0e9121425c2c6c6ca5a2cdd1712861` |
| setSolanaRecipient (correct, immediate) | `0x4acd18561d260f2d83be4a9fd35bef56317cb5ed1fe9abd3faaf6707daad32c8` |
| approve USDC | `0x12cc25e1eadbd02b54f866df1644224a64ab8ed7b32972ffbbf9d853b871f89b` |
| deposit $0.30 | `0xe3af7a02acca9ef48a96e956e6c0e812d7f7e7f24c7576311dc3e2a797534353` |
| allocate | `0xb88d4d2ea83a114f2f4667439e70aa27ea1fade8df24ce28eb83869dbc612ede` |
| approveBuy | `0x995ff5b3249f126654d3bbd460465b68783032d94cdd7d2a407957a8dd3e0ddd` |
| execute / CCTP | `0x7469e507c9718d9a8c002db40ca4d83f46076794bffb2eadc162e00c8279f660` |
| Solana receiveMessage | `2h42DGVD2s3Z2a7jCQ6MsD2TjF4keQcsf5Bi5XH9NvWDjcZoqX8FcmbaQqmyBsgJHHKpN2pDDUEQEpwuhZ7Q6zYD` |
| create AAPLx ATA | `3p5tAiuUKuBSiy7888cpgcwxxT5gLr87K3Fj1hY9AbhrQ3sn9YuBJoQ9sT4Zph5LX6akYMHtzpYQtRpDz7H6bVRB` |
| Jupiter USDC→AAPLx | `z8KApSXD4pjJBSokMvfRJqbcr7ChNjbGndwDv2XLoCUDNM1to8CfG8H23poEZCTmHsHb8j1h4hiySbNiyqZ3wxr` |

Result: **87,176** raw AAPLx (8 dec) in `5fuAN…`. Keys: `contracts/.env` `DEMO_USER_*` / `/tmp/ownback-demo-user.json` (gitignored).
