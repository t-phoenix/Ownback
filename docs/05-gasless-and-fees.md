# 05 · Gasless and fees

**Rules:**
1. Users only ever hold USDC. They never need ETH, BNB, SOL or any other gas token.
2. Every fee is shown in dollars and as a % of the amount **before** the user approves.
3. Every money move is **simulated first**. If the fee is over the user's cap, it doesn't run.
4. The default cap is **5% of the amount being invested or moved** (`maxFeeBps = 500`). The user can change it in Settings → Investing → Max fees (0.5–10%).

## What counts as a fee

| Part | Example | Included |
|---|---|---|
| Network gas on every chain in the route | Arc execute, Solana receive + swap, Base swap | ✓ |
| Protocol fees | CCTP fast-transfer fee, forwarder CCTP fee | ✓ |
| New token account rent (Solana) | First AAPLx buy for a user | ✓ |
| Venue fees | Jupiter route / LP fee, Uniswap pool fee | ✓ |
| Bridge fee (BNB route only) | Third-party bridge | ✓ |
| Price impact / slippage | Up to 1%, shown separately as "Price protection" | ✗ (shown, but has its own cap) |

**Fee check (required integer form):** `(feeUsd6 * 10_000n) / amountUsd6 <= maxFeeBps`.

Example: fees $0.05 on $5.00 → `(50_000n * 10_000n) / 5_000_000n = 100` → 1.00% ≤ default 500 bps → pass.

Display: `feePct = Number(feeUsd6) / Number(amountUsd6)` shown as percent; never compare that float to `maxFeeBps`.

**BuyApproval:** `maxFeeUsd6 = (amountUsd6 * BigInt(maxFeeBps)) / 10_000n`. Keeper/vault use the absolute; UI shows $ and % vs the user's limit.

## Simulation, then enforce

```
build route ─► simulate every step (EVM simulateContract + estimateGas · Solana simulateTransaction · CCTP/forwarder fee quote · venue quote)
           ─► fees in $ and %  ─► over cap?
                                   ├─ automatic step  → don't run; jar waits ("Fees are high right now (7.2% · your limit 5%)")
                                   └─ user action      → show it, block, offer "Change fee limit"
           ─► under cap → user signs (BuyApproval carries maxFeeUsd6) ─► run
mid-route: re-simulate before each later step; if now over the cap → stop, return the money to the jar (we pay the return)
after:     record the actual fees per step; show them on Done, Holding and Receipt detail
```

A confirmed transaction can't be undone. "Reverse" means the route stops **before** the next irreversible step and the money goes back to where it came from.

## Who signs and who pays, per action

| Action | Chain | Signer | Gas paid by | User sees |
|---|---|---|---|---|
| Save rules, Confirm, cancel jar, withdraw on Arc | Arc | User (Privy smart wallet or seed) | User, in USDC (Arc gas *is* USDC). **$0.10 USDC buffer** left in wallet for Google and seed (Q9) | "< $0.01" |
| Turn on auto-add (approve forwarder) | Base / Ethereum / Arbitrum | User | **MVP (D27):** feature flagged off for Google until a gas-sponsor spike (Privy sponsorship or our paymaster). Seed: user or paymaster when enabled | Hidden while flag off; else "$0.00 · we cover it" or fee preview |
| Auto-add a deposit (forwarder → CCTP fast → vault) | Source → Arc | Our relayer | Us (relayer gas). CCTP fast fee from the deposit, capped at 0.1% | "Fee $0.02 (0.1%)" on Deposit on its way |
| One-tap deposit from Solana | Solana → Arc | User (SPL via Privy Solana or seed), then our deposit relay | **Kora** or deposit-relay fee payer. Relay → CCTP: us | "$0.00 · we cover it" |
| Buy (keeper executes the signed approval) | Arc → venue | User signs BuyApproval; keeper + relay send | Taken from the amount bought: Arc execute + CCTP + venue gas + rent + route fee. **Solana (D26):** relay pays `receiveMessage` + Jupiter (`payer` = relay, destination = user ATA); never fund user SOL | Review: "Fees ~$0.05 (0.11%) · your limit 5%". Done: "Fees $0.05" |
| Buy failed or stopped by the cap → back to jar | Venue → Arc | Relay + keeper | **Us** | "No fee charged" |
| Withdraw to another chain | Arc → destination | User | CCTP fee from the amount; destination mint by us (relay/keeper) | "Fee ~$0.02 · arrives under a minute" (Withdraw) |

Buy arithmetic shown to the user: `from jars = bought + fees + left in jar (rounding)`. For example: $43.63 = $43.56 + $0.05 + $0.02.

**Per-item fee share:** a batch's actual fees are split across its items **pro rata by item amount** (largest remainder, whole micro-USDC). Each item's share must be ≤ its pro-rata share of the approval's `maxFeeUsd6`.

**Arc gas buffer (Google + seed):** wallets pay Arc gas themselves (in USDC). `deposit` / `depositAndAllocate` always leave **$0.10** in the user's Arc wallet, so they can still pay gas to withdraw or cancel. No Circle Gas Station for this build (Q9).

## Sponsor limits (so nobody can drain them, A16)

| Control | Setting |
|---|---|
| Kora / Solana fee payer | Allowlist: SPL Token transfer to our deposit account. Max 10/day per address |
| Relayer / forwarder | Only our relayer calls `forward`; CCTP fee ≤ 0.1%; per-user cap = their auto-add allowance (when D27 flag on) |
| Solana buy relay (`RELAY_SOL`) | Pays CCTP mint + Jupiter gas/ATA rent. Alert if SOL balance &lt; 0.05; never send to a non-user address |
| Keeper Arc USDC | Enough for execute gas; alert if Arc USDC &lt; $3 |
| Alerts | Sponsor/relay balance low; more than 50 relay tx/hour; any relay outflow to a non-user address |

## Spikes

| Spike | Question | If no |
|---|---|---|
| S-Privy | Privy smart wallet on Arc (5042) + Solana embedded; ERC-1271 for BuyApproval EIP-712; gas sponsorship on Base? | Fall back: seed path for demo; Arc-only fund |
| S4 | *(was Circle Gas Station on Arc)* — superseded by Q9 USDC buffer | Users pay fractions of a cent in USDC on Arc; show "< $0.01" |
| S5 | Is Gateway worth keeping next to the forwarder? | Drop Gateway; keep CCTP (done, Q9) |
| S14 | Kora: hosted or self-run | Self-run on Railway/Fly; or deposit-relay as fee payer |
| S17 | CCTP V2 fast transfer fee from Base/Ethereum/Arbitrum to Arc, and time | Standard transfer (slower, no fee) |
| S26 | EVM auto-add gas sponsor (Privy sponsorship or our paymaster) | Keep D27 flag off; Fund = Arc only |

Sources: [CCTP](https://developers.circle.com/cctp) · [Kora](https://solana.com/docs/tools/kora/getting-started) · [Jupiter payer](https://developers.jup.ag/docs/ultra/add-payer) · [Arc gas and fees](https://docs.arc.io/arc/references/gas-and-fees.md) · [Privy](https://docs.privy.io/)
