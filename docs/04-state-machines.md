# 04 · State machines

Every state the frontend shows and the backend stores, taken from the wireframe state boards. This file becomes `packages/shared/states.ts`. The frontend and backend both import those enums, so they can't disagree.

Notation: `state --event--> state`. **Bold** names are stored in Postgres. *Italic* names exist only in the UI.

## Timing constants (`packages/shared/timing.ts`)

| Name | Value | Where from |
|---|---|---|
| `DEPOSIT_POLL_MS` | 5 000 | FundStates 1 |
| `DEPOSIT_SLOW_AFTER_MS` / `DEPOSIT_SLOW_POLL_MS` | 180 000 / 30 000 | FundStates 7 |
| `MIN_DEPOSIT_USD6` | 1 000 000 ($1) | Fund |
| `READING_POLL_MS` | 700 | Reading |
| `QUOTE_REFRESH_MS` | 30 000 | BuyReview |
| `PRICE_REFRESH_MS` / `PRICE_STALE_AFTER_MS` | 60 000 / 300 000 | GlobalStates 2, 3 |
| `SKELETON_MAX_MS` | 2 000 | GlobalStates 1 |
| `JAR_READY_USD6` / `readyMinUsd6` | 5 000 000 ($5): **ready minimum** — reminder / "Ready" threshold only; jars and buys may be larger (Q1 revised, Q7) | Jars |
| `DEFAULT_MAX_FEE_BPS` | 500 (5% of the amount) | Q2 |
| `APPROVAL_TTL_MS` | 1 800 000 (30 min) | BuyApproval deadline |
| `MAX_SLIPPAGE_BPS` | 100 (1%) | BuyReview |
| `SWAP_RETRIES` | 2 attempts | BuyStates 5 |
| `BRIDGE_SLOW_AFTER_MS` | 180 000 | BuyStates 6 |
| `GMAIL_WINDOW_DAYS` / `GMAIL_MAX_PER_RUN` | 30 / 50 | Architecture |

## 1 · Purchase (`purchases.status`)

```
           ┌──read fails──► **read_failed** (CaptureError; nothing saved, row deleted after 24 h)
**reading** ┤
           └──read ok──► match runs ─┬─► **ready**         (Confirm)
                                     ├─► **needs_review**  (low-confidence brand, from Gmail batch or Blinkit-style multi-brand)
                                     └─► **not_listed**    (NoMatch: no buyable company or supplier)
ready / needs_review --user fixes match--> ready
not_listed --pick fallback--> ready (allocations = fallback asset)
not_listed / ready --skip--> **skipped**
ready --tap Confirm--> **confirming** --Allocated events seen--> **saved**
confirming --rejected / failed--> ready              (ConfirmStates 5: "Nothing was moved", match kept)
ready --over limit, user picks "save part now"--> confirming(part) --> **saved** + rest_usd6 > 0 (**rest_pending**, Q7)
saved --all allocations bought--> derived "Bought"
any --user deletes receipt data--> **deleted** (fields wiped, amounts kept for limits)
```

**Receipts filter labels (derived, not stored):**
- **In jars**: saved, with any allocation not yet bought.
- **Bought**: every allocation bought.
- **Needs review**: `needs_review`.
- **S&P 500 (fallback)**: allocations went only to the fallback.

## 2 · Confirm transaction (UI only, ConfirmStates)

```
*idle* --tap--> pre-check
  pre-check: free < amount  --> *not_enough* (offers "Add $X" or "Save $free now")
  pre-check: over limit     --> navigate to Limit
  else --> *approve* (Google: Circle sheet "Move $47.75 into 6 jars on Arc"; seed: on-screen approve)
*approve* --cancel--> *idle*
*approve* --signed--> *saving* ("Saving… usually 2 s", back disabled) --events seen--> *saved* → Saved screen
*saving* --revert / network--> *failed* ("Nothing was moved. Try again.")
```

## 3 · Deposit (`deposits.status`, FundStates)

```
*watching* (no row yet; polls every 5 s, "checked 3 s ago")
   --USDC transfer to user address seen--> **seen** --finality reached--> **confirming**
**confirming** --chain = Arc--> **added**
**confirming** --EVM chain, auto-add on--> **forwarding** (forwarder → CCTP fast → vault.receiveDeposit) --> **added**
**confirming** --auto-add off, or Solana--> **needs_approval** (push "tap to add it") --approved--> **moving** --> **added**
fee for the move > user's cap --> stays **needs_approval** with "Fees are high right now" (Q2)
**seen/confirming/moving** --no progress for 3 min--> slow flag (poll 30 s; "Base is busy. Your $20.00 is safe…")
amount < $1 --> **below_min** (waits; adds up with the next deposit until ≥ $1, then → added)
non-USDC token to our address --> **wrong_token** (shown, never added)
*check_failed* (UI only: offline or API unreachable, "Couldn't check · last checked 10:41")
Unsupported chain: not a state; a warning is always shown under the address.
```

## 4 · Jar (derived from the vault plus `buy_entries`)

```
*filling* (< ready minimum; "Buy now anyway" allowed, Q7) --allocations--> *ready* (≥ ready minimum, "Ready · tap to buy · price now $X")
*ready* / *filling* --user signs BuyApproval--> *approved* --keeper executes--> *buying*
*approved* --deadline passes unused--> back to *ready* / *filling*
*ready* --fees over the user's maxFeeBps--> *fees_high* ("Fees are high right now"); re-checked at each review
*buying* --bought all--> *filling* (only rounding remainder left) | *buying* --partly bought--> *ready/filling* with remainder
*buying* --swap failed twice--> *returning* --returnToJar--> previous state, same amount ("$5.08 is back in its jar")
any --token mint doesn't match registry--> *paused* ("We paused Gold: its token address changed") until re-verified
any --user cancels jar--> amount → free balance
*no_venue* (Q5: asset's venue not live yet) → "Buys when available"
Note: ready minimum is not a max. A jar of $33.43 is *ready* and may be bought in one approval.
```

## 5 · Buy batch (`buy_batches.status`)

```
**approved** (BuyApproval stored) --re-simulated--> **executing** (vault.execute sent on Arc)
**executing** --Executed event--> **bridging** (CCTP attestation pending; "Moved to Solana" step)
**bridging** --minted to relay--> **swapping**
**swapping** --all entries final--> **done** | **done_partial** (some entries partly bought or returned)
**bridging** > 3 min --> slow flag only (BuyStates 6)
**executing** reverted --> **failed** (no money moved; jars untouched)
```

One batch covers one venue domain. Batches only contain items from signed, unexpired BuyApprovals (Q7).

## 6 · Buy entry (`buy_entries.status`, one per user × asset in a batch)

```
**quoted** --price moved > 1% or fees over the cap before execute--> **waiting** (ask "Buy at $301.10 or Wait?"; a new price needs a new signature)
**quoted** --included in execute--> **sent**
**sent** --swap ok, full--> **bought** (fill price, qty, tx stored)
**sent** --swap ok, partial liquidity--> **bought** with amount < requested (keeper never executes more than the quote supports, D10)
**sent** --swap failed (attempt 1)--> retry --failed (attempt 2)--> **returning** --CCTP back + returnToJar--> **returned**
**quoted/sent** --mint ≠ registry--> **paused**
```

## 7 · Gmail connection (`gmail_connections.state`, GmailStates)

```
**none** (seed user; card "Connect Gmail") --connect--> OAuth (pick account) --granted--> **scanning**
**no_access** (Google user, scope not granted; "Let us find your receipts") --allow--> **scanning**
**scanning** ("120 of 480") --done, new > 0--> **found** ("3 new invoices found")
**scanning** --done, new = 0--> **caught_up** ("Last checked 10 min ago")
**found / caught_up** --app open or cron--> **scanning**
any --token revoked or refresh fails--> **revoked** ("Gmail disconnected", past receipts stay)
**revoked** --reconnect--> **scanning**
```

**Message labels in the invoice list (`gmail_messages.status`):**
- **new**
- **added**: already a purchase
- **not_product**: for example Uber
- **matched**: just turned into a purchase

## 8 · Withdraw (`withdrawals.status`)

```
*draft* (amount 25% / 50% / All, chain) --tap--> *approve* --signed--> **sending** --arrived--> **sent** ("Sent $35.40 to your wallet on Base")
**sending** --revert--> **failed** (free balance unchanged)
cross-chain: **sending** covers burn on Arc → attestation → keeper relays the mint on the destination
```

## 9 · Session

```
*signed_out* --Google or seed--> *onboarding* (no rules yet) --rules saved--> *active*
*active* --cookie expired--> *signed_out* (after sign-in, return to the saved path; GlobalStates 6)
```

## 10 · App-wide (UI only, GlobalStates)

| State | Trigger | Shows |
|---|---|---|
| loading | First open of a tab | Skeleton blocks in the real layout, at most 2 s |
| refreshing | Pull down | Small spinner, numbers stay |
| stale_prices | Price feed older than 5 min | "Prices from 10:41 · refreshing" |
| offline | `navigator.onLine` false or fetch fails | Top bar "You're offline · showing what we had at 10:41". Photos queue and send when back |
| error | 5xx or unknown code | "We couldn't load this. Your money isn't affected." + Try again. Never show codes |
| signed_out | 401 | Sign in, then return |
| empty | No data | One line + one button, for example "Your receipts show up here · Add a purchase" |

## Activity event kinds (`events.kind`)

`deposit_added`, `rules_changed` (A22), `fees_high`, `buy_reminder`, `approval_expired`, `solana_recipient_changing` (A6), `receipt_matched`, `needs_review`, `jar_ready`, `fallback_used`, `limit_warning` (80%), `limit_reached`, `buy_done`, `buy_partial`, `buy_returned`, `buy_paused`, `withdraw_sent`, `gmail_found`, `gmail_revoked`, `rest_ready` (Q7).

Each kind has a copy template in [frontend/copy-and-errors.md](../frontend/copy-and-errors.md) and a push on/off flag that follows the three Settings toggles (buy done · receipt needs review · near monthly limit).
