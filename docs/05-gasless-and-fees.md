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
| Protocol fees | CCTP fast-transfer fee, Gateway 0.005%, forwarder CCTP fee | ✓ |
| New token account rent (Solana) | First AAPLx buy for a user | ✓ |
| Venue fees | Jupiter route / LP fee, Uniswap pool fee | ✓ |
| Bridge fee (BNB route only) | Third-party bridge | ✓ |
| Price impact / slippage | Up to 1%, shown separately as "Price protection" | ✗ (shown, but has its own cap) |

`fee% = total fees ÷ amount`. The check is `fee% ≤ maxFeeBps`.

## Simulation, then enforce

```
build route ─► simulate every step (EVM simulateContract + estimateGas · Solana simulateTransaction · CCTP/Gateway fee quote · venue quote)
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
| Save rules, Confirm, cancel jar, withdraw on Arc | Arc | User | Google: **Circle Gas Station** (spike S4; Arc's docs don't list it yet). Seed: user, in USDC (Arc gas *is* USDC, fractions of a cent) | "$0.00 · we cover it" or "< $0.01" |
| Turn on auto-add (approve forwarder) | Base / Ethereum / Arbitrum | User, once per chain | Google: Gas Station. Seed: **Circle Paymaster** (gas in USDC) | "$0.00 · we cover it" |
| Auto-add a deposit (forwarder → CCTP fast → vault) | Source → Arc | Our relayer | Us (relayer gas). CCTP fast fee from the deposit, capped at 0.1% | "Fee $0.02 (0.1%)" on Deposit on its way |
| One-tap deposit from Solana | Solana → Arc | User (SPL transfer), then our relay | Google: Gas Station fee payer. Seed: **Kora**. Relay → CCTP: us | "$0.00 · we cover it" |
| Buy (keeper executes the signed approval) | Arc → venue | User signs the approval; keeper + relay send | Taken from the amount bought: Arc execute + CCTP + venue gas + rent + route fee | Review: "Fees ~$0.05 (0.11%) · your limit 5%". Done: "Fees $0.05" |
| Buy failed or stopped by the cap → back to jar | Venue → Arc | Relay + keeper | **Us** | "No fee charged" |
| Withdraw to another chain | Arc → destination | User | CCTP fee from the amount; destination mint by us | "Fee ~$0.02 · arrives under a minute" (Withdraw) |

Buy arithmetic shown to the user: `from jars = bought + fees + left in jar (rounding)`. For example: $43.63 = $43.56 + $0.05 + $0.02.

## Sponsor limits (so nobody can drain them, A16)

| Control | Setting |
|---|---|
| Gas Station policy | Allowlist: USDC, OwnbackVault, OwnbackDepositForwarder, CCTP TokenMessengerV2. Sponsorship starts after a wallet's first deposit of ≥ $1. Per wallet: 20 tx/day, $0.50/day. Global: $10/day |
| Kora | Allowlist: SPL Token transfer to our deposit account. Max 10/day per address |
| Relayer / forwarder | Only our relayer calls `forward`; CCTP fee ≤ 0.1%; per-user cap = their auto-add allowance |
| Alerts | Sponsor balance < $3; more than 50 sponsored tx/hour; any relay outflow to a non-user address |

## Spikes

| Spike | Question | If no |
|---|---|---|
| S4 | Circle Gas Station sponsors user-controlled SCA tx on **Arc mainnet** (not in Arc's docs as of 6 Nov) | Users pay fractions of a cent in USDC on Arc; show "< $0.01" |
| S5 | Is Gateway worth keeping next to the forwarder? | Drop Gateway; keep CCTP |
| S14 | Kora: hosted or self-run | Self-run on Railway/Fly |
| S17 | CCTP V2 fast transfer fee from Base/Ethereum/Arbitrum to Arc, and time | Standard transfer (slower, no fee) |
| — | Circle Paymaster's current fee | EIP-3009 relayer |

Sources: [Circle Paymaster](https://developers.circle.com/paymaster) · [Gas Station](https://developers.circle.com/wallets/gas-station) · [Wallets on Solana](https://developers.circle.com/wallets/wallets-on-solana) · [Gateway fees](https://developers.circle.com/gateway/references/fees) · [CCTP](https://developers.circle.com/cctp) · [Kora](https://solana.com/docs/tools/kora/getting-started) · [Jupiter payer](https://developers.jup.ag/docs/ultra/add-payer) · [Arc gas and fees](https://docs.arc.io/arc/references/gas-and-fees.md)
