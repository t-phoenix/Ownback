# Keeper and jobs

Since 6 Nov (Q7), **nothing buys on its own.** The keeper only executes what a user signed in a BuyApproval. Sunday is a reminder.

## Schedules

| Job | Trigger | Route | Notes |
|---|---|---|---|
| Buy reminder | Cron `30 4 * * 0` (Sun 04:30 UTC = 10:00 IST, the user's buy day) | `POST /api/jobs/buy-reminder` | Push "3 jars ready · review and buy". No money moves |
| Execute approved buys | Right after a user signs (`POST /api/buys`), and a sweep every 5 min for approvals still pending | `POST /api/jobs/keeper/run` | Skipped when `KEEPER_ENABLED=false` |
| Auto-add deposits (Q3) | Deposit seen on Ethereum/Base/Arbitrum for a user with auto-add on; sweep every 2 min | `POST /api/jobs/deposits/forward` | Relayer calls `forwarder.forward` |
| Receive deposits on Arc | After each forward's attestation | same job | `vault.receiveDeposit` |
| Gmail scan | App open (per user, at most once every 10 min) + cron every 6 h | `POST /api/jobs/gmail/scan` | 50 messages per user per run; DKIM pass only (A8) |
| Prices | On demand (60 s cache) + every 15 min | `POST /api/jobs/prices/refresh` | Jupiter price API + reference feed (A4) |
| Arkiv refresh | Weekly | `POST /api/jobs/arkiv/refresh` | Extend entities with < 30 days left (A17) |
| Rest pending (Q7) | Cron `0 0 1 * *` | `POST /api/jobs/rest-pending` | "Ready to save $42.75 from Croma · Approve" |
| Relay watcher | Every 1 min | `POST /api/jobs/relay/watch` | Alert on relay USDC older than 10 min, or an outflow to a non-user address (A3) |

All job routes require `Authorization: Bearer $CRON_SECRET` and are idempotent.

## Buy flow, step by step

Keeper code: `apps/web/lib/keeper/`. Each step writes its state to `buy_batches` / `buy_entries` **before** moving on, so a crash resumes and never duplicates.

```
REVIEW (GET /api/buys/review, user present)
 1. Read the user's jars (chain wins over the DB mirror). Include ready jars and, if asked, filling jars ("Buy now anyway").
 2. Pick the venue per asset: for each enabled venue with a verified mint (A1 two-source rule),
    quote all-in cost = price impact + every fee from the simulated route (docs/05). Choose the cheapest.
 3. Reference price check (A4): pool price within 2% of the reference (Pyth / Jupiter price API). If not → "waiting".
  4. Fee check: `(feeUsd6 * 10_000n) / amountUsd6 <= maxFeeBps`. If not → row shows "Fees too high (x%)" and is unselected.
 5. Return the rows with price, qty, max price (+1%), fees ($ and %), venue, and the BuyApproval typed data to sign.

APPROVE (POST /api/buys {approval, signature})
 6. Verify the signature server-side (same check the vault does), store it in buy_approvals, and group the items by venue domain.

EXECUTE (keeper/run)
 7. Lock (keeper_lock, SKIP LOCKED). One batch per venue domain.
 8. Re-simulate the whole route. If price > item max or fee > approval max → item 'waiting' (not executed). Stop here if nothing is left.
 9. vault.execute(batchId, domain, orders) from the keeper EOA (`KEEPER_*`). Read Executed + BatchSent. Status 'bridging'.
10. Poll Iris /v2/messages for the attestation (5 s; slow after 3 min). receiveMessage on the venue chain (Solana: buy relay pays SOL, D26).
    Check the relay's USDC went up by the batch total. Status 'swapping'.
11. Per item:
    a. Mint == Arkiv (createdBy+ownedBy our writer) == assets.ts, else 'paused' → step 13.
    b. Fresh quote + reference check + fee re-simulation. Over max price or max fee → step 13.
    c. Swap with MEV protection (Jupiter protected send / Jito bundle; Uniswap with a private RPC on EVM),
       destination = the user's own address, slippage ≤ 1%, split if price impact needs it.
       Solana: Jupiter `payer` = relay, destination = user ATA (never fund user SOL for buys).
       BNB route: Base relay → audited bridge (capped) → swap on PancakeSwap → user's EVM address.
    d. Read the user's token balance before and after → qty, fill = spent ÷ qty. Fill > max → alert + pause the asset.
    e. Fee for this item = its pro-rata share (by item amount) of the batch's actual route costs; deducted from the amount swapped; must be ≤ its pro-rata share of maxFeeUsd6 (docs/05).
    f. Failure: retry once with a fresh quote. Second failure → step 13.
12. Proof: one Arkiv `proof` entity per bought item (no user data). Through the write queue.
13. Return: everything not bought → one CCTP burn from the relay to the vault → receiveMessage on Arc → returnToJar per item. We pay. Status 'returned'.
14. Finish: batch 'done' / 'done_partial'; events; push "Buy done".
```

### Money-safety guards

| Risk | Guard |
|---|---|
| Keeper buys without consent | The vault rejects `execute` without a valid BuyApproval (A2) |
| Two runs at once | Lock row + unique `batch_uuid` + on-chain `usedBatch` |
| Crash after execute | Status `bridging` stored with `arc_tx`; resume from step 10 |
| Crash mid-swap | `venue_tx` stored before confirming; on resume, check the tx before retrying |
| Price manipulation | Reference check (≤ 2%), max price (+1%) signed, MEV-protected send, post-swap fill check (A4) |
| Fees over the cap | Simulated at review, before execute and before each swap; stop and return to the jar |
| Leftover USDC in the relay | Step 13 always runs; the relay watcher alerts after 10 min |
| Wrong amount shown | Quantity and price come from on-chain balance changes, never the quote |

## Auto-add deposits (Q3)

1. **Watcher.** It sees USDC arrive at the user's address on Ethereum, Base or Arbitrum (logs from the stored cursor, or a Circle webhook as a hint). It needs the chain's finality before forwarding.
2. **Checks.** Auto-add must be on, with allowance ≥ amount. Then simulate `forward(user, amount, maxFee)`. The fee is the CCTP fast fee (≤ 0.1%), shown to the user in the deposit steps.
3. **Forward.** The relayer calls `forward`, then Iris attestation, then the keeper calls `vault.receiveDeposit`. The deposit becomes `added`, with the push "$20.00 added".
4. **Not turned on, or allowance too low:** the deposit becomes `needs_approval`, with the push "tap to add it".
5. **Solana, Google users (A15):** one tap does an SPL transfer from the Privy Solana wallet to the deposit relay (Kora/deposit-relay fee payer). The relay then does a CCTP burn with `hookData = user`, followed by `receiveDeposit`. The limit is $500 per deposit.

## Gmail scan

1. Refresh the token. A failure sets the state to `revoked`.
2. List messages from the allowlist in the last 30 days that aren't already in `gmail_messages`.
3. Keep only messages whose `Authentication-Results` shows **DKIM pass** for the shop's domain (A8).
4. For each message (max 50): run 0G `read_invoice`. If it isn't a product, mark it `not_product`. Otherwise mark it `new` with the shop, a summary, the local amount and the USD amount at read time. Drop the body.
5. Set the state to `found` or `caught_up`. `POST /api/gmail/invoices/match` turns the selected ones into purchases.

## Price cache

`price_cache(asset_id, chain, usd6_per_unit, ref_usd6, at)`:
- Jupiter price API and the reference feed, fetched in one batch.
- Anything older than 5 min is marked `stale`.
- USDC = $1.
