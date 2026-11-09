# Copy and errors

Every message a user can see, taken word for word from the wireframes where they have it. This becomes `apps/web/lib/copy.ts`. Variables are in `{braces}`. **It freezes Fri 12:00.**

Voice (from the brand kit):
- Plain-spoken, like a friend who knows money.
- Specific: real numbers, real company names.
- Honest about risk, in one line.

Use company names first and tickers second.

## Banned words

These never appear in the UI: guaranteed, returns, profit, moon, token\*, bridge\*, CCTP\*, "invest smarter", "wealth journey".

\* Allowed only inside proof trail rows and explorer labels, where they name the real thing ("CCTP", "Arc tx").

## Error codes → copy

The UI never shows the code itself.

| Code | Where | Copy | Buttons |
|---|---|---|---|
| `UNAUTHENTICATED` | any | (no message) → Sign in, then back | — |
| `AUTH_INVALID` | Sign in | "That didn't work. Try signing in again." | Try again |
| `GEO_BLOCKED` | Sign in | "Ownback isn't available in the US. The shares we buy aren't offered to US persons." | — |
| `VALIDATION` | forms | Field-level: "Pick between 2% and 10%." / "Enter an amount above $0." | — |
| `RATE_LIMITED` | any | "Slow down a moment, then try again." | Try again |
| `UPLOAD_TOO_LARGE` | Add | "That file is too big. Try a screenshot instead." | — |
| `UNSUPPORTED_MEDIA` | Add | "We can read photos, screenshots and voice notes." | — |
| `READ_FAILED` | Couldn't read | "We couldn't find a total or a product name. Nothing was saved." + tips "Flat surface, good light · Whole receipt in the frame · Or a screenshot of the order page" | Retake photo · Type it instead |
| readError `not_a_receipt` | Couldn't read | "This doesn't look like a receipt or order screen. Nothing was saved." + tips | Retake photo · Type it instead |
| readError `og_unavailable` | Couldn't read | "The private AI on 0G didn't answer. Nothing was saved. Try again in a moment." | Try again · Type it instead |
| readError `timeout` | Couldn't read | "Reading took too long. Nothing was saved. Try again." | Try again · Type it instead |
| `NOTHING_TO_BUY` | Confirm | → Brand not listed screen | — |
| `INSUFFICIENT_FREE` | Confirm | "You have {free} free. Add {short} or save {free} now and the rest later." | Add funds · Save {free} |
| `LIMIT_REACHED` | Confirm | → Limit reached screen | — |
| `TX_REVERTED` / `CHALLENGE_FAILED` | Confirm, Withdraw, Cancel jar | "Nothing was moved. Try again." | Try again |
| `TX_NOT_FOUND` | after signing | (no message) keep showing "Saving… usually 2 s" and retry | — |
| `QUOTE_EXPIRED` | Buy review | (no message) re-fetch quotes | — |
| `PRICE_MOVED` | Buy review | "{asset} is now {price}, more than 1% above your quote. Buy at the new price or wait?" | Buy at {price} (signs again) · Wait |
| `FEES_TOO_HIGH` | Review, Withdraw, deposits | "Fees would be {fees} ({pct}% of {amount}). Your limit is {cap}%." | Wait · Change fee limit |
| `BAD_SIGNATURE` / `APPROVAL_EXPIRED` | Buy review | "That approval didn't go through. Review the prices again." | Review again |
| `KEEPER_DISABLED` | Jars, Buy | "Buys are paused while we check something. Your money is safe and you can withdraw any time." | — |
| `NONCE_USED` | Sign in | "That sign-in link was already used. Try again." | Try again |
| `CHAIN_UNSUPPORTED` | Add funds, Withdraw | "We don't support that chain. Use Arc, Solana, Base, Ethereum or Arbitrum." | — |
| `DEPOSIT_NOT_READY` | Add funds | (no message) keep showing the deposit steps and poll again | — |
| `NO_READY_JARS` | Jars, Buy review | "No jar is ready yet. You can still buy a smaller jar with Buy now anyway." | — |
| `GMAIL_DISABLED` | Gmail card | Hide the Gmail card; show only Snap / Say / Type | — |
| `FEATURE_OFF` | Settings (0G account) | Hide the row | — |
| `INSUFFICIENT_FREE` (buy, `availableUsd6`) | Buy review | "You have {available} available on Arc. Add funds or buy a smaller amount." | Add funds |
| `VALIDATION` (amount) | Buy review, Sell | "Check the amount and try again. The smallest buy is $0.10." | — |
| `NO_SOLANA_RECIPIENT` | Withdraw | "Set up your Solana wallet first." (shows one approval) | Set up |
| `GMAIL_REVOKED` | Gmail card | (state 6 copy below) | Reconnect |
| `UPSTREAM`, `INTERNAL`, unknown | any | "We couldn't load this. Your money isn't affected." | Try again |
| offline | any | "You're offline · showing what we had at {time}" | Try again |

## Add funds

| State | Copy |
|---|---|
| Intro | "Send USDC from any chain we support. It all lands in one dollar balance, and we move what's needed to your vault on Arc." |
| Address | "Your USDC address on {chain} · min $1" · "Same address on Arc, Base, Ethereum, Arbitrum" · "Only USDC, only on {chain}. Solana has its own address." |
| 1 Watching | "Watching {chain} for your USDC… checked {n} s ago" · "Checks every 5 s while this screen is open. Pull down or tap to check now." · "Skip for now · we'll tell you when it lands" |
| 2 Seen | "Deposit on its way" · "{amount} USDC From {from} on {chain} · {time}" · steps "Seen on {chain}" / "Confirmed {have} of {need} confirmations · ~{eta} s" / "Added to your dollar balance" / "Ready to use" · "Updating live · about {eta} s left" · "You can close the app. The money is already yours; we'll send a notification when it's ready." (Q3: if option A, change to "…we'll ask you to approve once when it lands.") |
| Needs approval (Q3) | Sheet: "Add {amount} to your vault on Arc" · push: "{amount} arrived · tap to add it" |
| Auto-add (Q3) | Row: "Auto-add from {chain} · up to {cap}" (hidden while `AUTO_ADD_EVM` off, D27) · sheet: "Let Ownback move USDC that arrives on {chain} into your own vault on Arc. It can't send it anywhere else. Fee up to 0.1%." · step: "Moved to your vault on Arc · CCTP · fee {fee}" |
| One tap (Solana or auto-add off) | Push: "{amount} arrived on {chain} · tap to add it" |
| 3 Added | "{amount} added" · "Your dollars are ready. Add a purchase and {rate}% of it goes into the companies behind it." · "Network fee $0.00 (we cover it)" · push "{amount} added" |
| 4 Below minimum | "We got {amount}. The minimum is $1, so it's waiting. Send {short} more and we'll add both." |
| 5 Not USDC | "We received {amount} {symbol}. We only accept USDC, so we haven't added it. It's still in your wallet; you can send it back from Wallet." |
| 6 Unsupported chain | "Only Arc, Solana, Base, Ethereum, Arbitrum." |
| 7 Slow | "{chain} is busy. Your {amount} is safe and will be added automatically." |
| 8 Can't check | "Couldn't check · last checked {time}" |

## Gmail card

| State | Title · body · button |
|---|---|
| 1 none | "Connect Gmail" · "Find invoices in your inbox automatically. Pick a Google account; we only look at emails from shops." · Connect Gmail |
| 2 no_access | "Let us find your receipts" · "You're signed in as {email}. Allow read-only access so we can find order emails from the last 30 days. We never send, delete or keep emails." · Allow read access |
| 3 scanning | "Looking through your inbox…" · "Checking order emails from the last 30 days · {done} of {total}" |
| 4 found | "{n} new invoices found" · "{shop1} · {shop2} · {shop3}" · Review {n} invoices |
| 5 caught_up | "You're all caught up" · "Last checked {ago} · we check again when you open the app." · Check now |
| 6 revoked | "Gmail disconnected" · "Your past receipts stay. Reconnect to keep finding new ones." · Reconnect |

## Purchase flow

| Screen / state | Copy |
|---|---|
| Add footer | "Receipts and emails are read by a private AI model on 0G and not stored. Only shop, item, amount and date are kept." |
| Reading steps (D30, from the server) | "Read the receipt" · "Convert to dollars" · "Understand the product" · "Ask 3 private AI jurors" · "Merge their answers" · "Check which ones you can buy" · sub "Three private AI models on 0G look at it. Usually under a minute." · footer "Read by a private AI model on 0G. The photo is deleted after reading. Request ID {id}" |
| Check the details | title "Check the details" · needs_details "We couldn't read everything. Fix or fill in what's highlighted, then we'll find the companies." · edit "Change anything that's wrong. We'll look for the companies again." · missing field hint "We couldn't read this" · "Add an item" · button "Find the companies" · "Keep the current match" · Confirm link "Wrong details? Edit them" |
| Confirm sections (D30) | "Parent company" · "Top 5 companies that help build it" · "Top 3 commodities" · "Your fallback" ("Gets the share we can't buy on-chain yet.") · row badge "Buy on Solana · {symbol}" / "Not on-chain yet" / "Private company" · "{n}/{of} agree" · disclosure "How we chose these" |
| Confirm button | "Confirm {invest} across {n}" · "Only {maker}" · "Wrong product? Fix it" |
| Confirm approval (Privy / seed) | "Move {invest} into {n} jars on Arc" |
| Confirm fee (Q2) | "Network fee $0.00 · we cover it" (or "< $0.01") |
| Saving | "Saving… usually 2 s" |
| Not tokenized | "not tokenized yet" |
| Why these companies | "Maker: {product} → {maker} (Wikidata). Suppliers: {sources}, with the quoted sentence. Materials: from the product's bill of materials. AI request ID: {id}" |
| Not listed | "{brand} is a private company, so there are no shares to buy. Your {rate}% ({amount}) can go somewhere else." · info "We also checked the companies behind it ({examples}). None of them have tokenized shares yet, so there's nothing else to buy for this product." · "Put {amount} into {fallback}" · "Skip this purchase · Nothing is saved" |
| Limit | Removed (D32): there is no monthly limit. Only the free balance can trim a save ("You have {free} free…"). |
| Saved | "{invest} is in {n} jars" · "{maker}'s jar is ready. Tap to buy when you want." / "{assets} fill up from your next purchases. We'll remind you on Sunday." |
| Rest pending (Q7) | Activity: "Ready to save {rest} from {shop}" · Approve |

## Buying

| State | Copy |
|---|---|
| Jars intro | "Dollars wait in your vault on Arc. When a jar reaches $5 we'll remind you on Sunday. Nothing buys without your OK." |
| Jar ready | "Ready · tap to buy · price now {price} per {token}" |
| Filling, buy anyway | "Buy now anyway · fees {fees} ({pct}%)" |
| Fees high | "Fees are high right now ({pct}% · your limit {cap}%). Your jar waits." |
| Reminder push | "{n} jars ready · review and buy" |
| Jar filling | "Filling · {why}" |
| No venue (Q5) | "Buys when available" |
| Review | "Prices update live · next in {s} s" · "Price now {price} per {token}" · "You get about {qty} {token}" · "Won't buy above {max} (+1%)" · "Price protection 1% · if the price moves more, that jar waits" · "Shares go straight to your Solana wallet {addr}." · "Token verified on Arkiv" (links to the Arkiv explorer record; shown only when the registry record matches) |
| Fees (review) | Row: "Fees {fee} ({pct}%)" · footer: "Fees {total} ({pct}% · your limit {cap}%)" · approval sheet: "Buy {n} assets · up to {total} · max fees {maxFee}" |
| Fees (done) | "Bought {bought} · fees {fees} · left in jars {left}" |
| Progress | "{k} of {n} bought" · "Took {total} from your jars" · "Moved to Solana" · "Bought {asset} {qty} {token} at {fill} (quote {quote}) · {amount}" · "You can leave this screen. We'll notify you when it's done. If a price moves more than 1%, that jar keeps its dollars until you approve again." |
| Partly bought | "Bought {amount} of {asset} ({qty} {token} at {price}). {rest} stays in the jar for next time." |
| Failed | "We couldn't buy {asset} today. {amount} is back in its jar." · "No fee charged." |
| Bridge slow | "Your {total} is moving to Solana and is safe. Buys continue automatically." |
| Paused | "We paused {asset}: its token address changed. Your {amount} stays in the jar." |
| Done | "Buy done" · "Bought {n} assets · fees {fee} · {date}" · "Paid vs quote within {bps}%" · "Each row opens the asset with its price history and proof." |

## Activity titles (`events.kind`)

| Kind | Title · body |
|---|---|
| buy_done | "Buy done" · "{asset1} at {price1}, {asset2}, {asset3} · {total} · fees {fee}" |
| receipt_matched | "Receipt matched" · "{shop} {item} → {invest} across {n}" |
| needs_review | "Needs your review" · "{shop} receipt · {n} brands we're not sure about" |
| jar_ready | "Jar ready" · "{asset} reached $5 · tap to buy" |
| fallback_used | "Not listed, used fallback" · "{brand} → {fallback} · {amount}" |
| limit_warning | "80% of monthly limit used" · "{used} of {cap} · resets {date}" |
| limit_reached | "Monthly limit reached" · "{used} of {cap} · resets {date}" |
| fees_high | "Fees are high right now" · "{asset}: {pct}% · your limit {cap}% · your jar waits" |
| approval_expired | "Buy approval expired" · "Prices changed or time ran out. Review again to buy." |
| gmail_revoked | "Gmail disconnected" · "Your past receipts stay. Reconnect to keep finding new ones." |
| rest_ready | "Ready to save {rest} from {shop}" · "Approve to put it in your jars" |
| rules_changed | "Your rules changed" · "{what} · not you? Sign out everywhere" |
| solana_recipient_changing | "Your Solana withdraw address changes on {date}" · "Not you? Cancel it in Wallet" |
| buy_reminder | "{n} jars ready" · "Review the prices and buy" |
| deposit_added | "{amount} added" · "From {chain}" |
| withdraw_sent | "Sent {amount} to your wallet on {chain}" |
| gmail_found | "{n} new invoices in Gmail" |
| buy_returned / buy_paused / buy_partial | Same as the Buying copy above |

## Holding and legal lines

- "You spent {spent} on {company} this year. You now own {value} of {company}."
- Issuer note: "{token} is issued by a third party; it tracks {company} stock but is not a share registered in your name."
- Withdraw: "The vault can only pay you. To send to someone else, withdraw first and send from your own wallet app."
- Sign in footer: "By continuing you accept the Terms · Risks"
