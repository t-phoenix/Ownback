# 01 · Product overview

Source: wireframes first, then PRD v2. This doc summarizes them and doesn't add scope.

## The product in one paragraph

You buy an iPhone. You snap the receipt, or Ownback finds the invoice in your Gmail. AI on 0G reads it and converts ₹79,900 to $955.00 at that moment's rate. It then works out who is behind the product: Apple made it, TSMC, Qualcomm and Corning supply parts, and it contains gold and silver. Your 5% ($47.75) is split 70 / 20 / 10 across those companies and materials into per-asset USDC jars in a vault on Arc. When a jar reaches $5, Ownback reminds you (Sunday 10:00 by default). You review the live price and the fees, then approve. Only then does it buy, on whichever chain is cheapest all-in, never paying more than 1% above the quote or more fees than your limit. You can also buy a smaller jar whenever you want. The shares go straight to your own wallet, and every step leaves a public proof.

## Who it's for

A person aged 22–35 in India or another non-US market. They already hold a little USDC, shop online, and have never bought a US stock.

The job they want done: *"When I buy something I like, let me own a bit of that company, without thinking about it."*

## In scope (must demo)

1. **Sign in.** Two options:
   - Google: a Circle wallet is created on Arc and Solana, with no seed phrase.
   - Seed phrase: create a new one or import your own. The words never leave the phone.
2. **Set your rules.** Share of each purchase (2–10%, default 5%), monthly limit, max per company, and a fallback asset: S&P 500 by default, or Nasdaq 100, Gold, Bitcoin, Ether or US T-bills.
3. **Add funds.** Send USDC from Arc, Solana, Base, Ethereum or Arbitrum and it shows as one dollar balance. Card and UPI are shown as "Coming soon".
4. **Add a purchase.** Gmail invoices, a photo or screenshot, voice, or typing.
5. **Currency conversion** when the receipt is read. After that, every amount is in dollars.
6. **AI match.** Shows the maker, the companies behind the product and the raw materials, each with a token and venue. Also:
   - "Fix the match" search
   - "Brand not listed" fallback
   - "Couldn't read" screen
7. **Split 70 / 20 / 10.** Includes an edit screen and an "Only the maker" shortcut.
8. **Per-asset jars** in the Arc vault, with a "Limit reached" screen (save part now, the rest next month).
9. **Buy when you approve** (reminder on Sunday, or any time). Shows the live price, quantity, max price, venue and fees (in $ and %) before you sign, and the fill price and fees paid after. Venues on several chains (Solana first; Base, Ethereum, Arbitrum, BNB behind flags).
10. **Dashboard.**
    - Home: total balance split by type and by chain.
    - Holdings, filtered by type and chain.
    - Holding: price now, your average price, each buy, and the proof trail.
    - Receipts, receipt detail and Activity.
11. **Share card**: Post to X, Post to LinkedIn, Copy text, Copy image, More. The shared link opens a landing page carrying a referral code.
12. **Settings and Wallet**: rules, addresses, sign-in and recovery, Gmail and 0G connections, notifications, download or delete my data, withdraw.

**Out (say "next" in the pitch):**
- card/UPI on-ramp
- zkEmail/zkTLS receipt proofs
- brand-funded rewards
- selling inside the app
- native mobile app
- tax reports
- live filing-reading for any product (the MVP uses about 10 precomputed products)
- a second Google account as backup sign-in

**Nice to have:**
- sign in with a 0G account and spend the user's daily iAI credits
- AI-suggested rate per category

## Every screen (the 36 wireframe boards)

See them all in one page: [ownback-wireframes.html](../ownback-wireframes.html).

There's a bottom tab bar on the main screens: **Home · Holdings · + Add · Receipts · Settings**. Activity opens from the bell on Home.

| Flow | Boards |
|---|---|
| A · Onboarding | Shared link (web) · Sign in · Seed phrase · Set your rules · Home, first time |
| A2 · Add funds | Add funds (watching) · Deposit on its way · Funds added · *Add funds: every state* (8 states) |
| B · Dashboard | Home · Holdings · Holding · Activity · *App-wide states* (7 states) |
| C · Add a purchase | Add a purchase · *Gmail card: every state* (6) · Invoices in Gmail · Reading · Confirm · *Confirm: every state* (6) · Edit split · Fix the match · Brand not listed · Limit reached · Couldn't read · Saved |
| D · Buying | Jars · Buy review · Buying · Buy done · *Buying: every state* (8) |
| E · Receipts | Receipts · Receipt detail |
| F · Settings | Settings · Wallets and sign-in · Withdraw |

Boards in *italics* are state boards. They aren't separate screens; they list the states the real screens must show. Each one maps to a machine in [04-state-machines.md](04-state-machines.md).

Routes for every board are in [frontend/screens-and-routes.md](../frontend/screens-and-routes.md).

## Product rules that code must enforce

| Rule | Value | Enforced by |
|---|---|---|
| Share of each purchase | 2–10%, default 5% | Vault `setRules` (bounds) and the app |
| Monthly limit | User-set, default $50, resets on the 1st | Vault `allocate` |
| Max per company | User-set % of the monthly limit, per asset per month, default 20%. Overflow goes to the fallback (Q1) | Match step + vault `allocate` |
| Default split | 70% maker / 20% behind the product / 10% raw materials, spread evenly across what's buyable | Backend match, editable by the user |
| Jar ready at | $5 (reminder). Smaller jars can be bought if the user asks (Q7) | App; no on-chain minimum |
| Every buy | Needs the user's signed BuyApproval | Vault `execute` |
| Max fees | User-set, default 5% of the amount; simulated before every money move | Backend + BuyApproval |
| Price protection | Never more than 1% above the reviewed quote | Keeper |
| Buy reminder | Sunday 10:00 IST (04:30 UTC) | Cron (reminder only) |
| Where shares go | Only the user's own wallet | Keeper + vault relay rules ([06-security.md](06-security.md)) |
| Where withdrawals go | Only the user's own address, on any of the 5 chains | Vault `withdraw` |
| Minimum deposit | $1 | Deposit watcher |
| Fees the user sees | Always in $ and %, before approving | [05-gasless-and-fees.md](05-gasless-and-fees.md) |
| US persons | Blocked (xStocks are not for US persons) | Edge middleware geo-block + Terms |

## Demo success metric

On stage, one real iPhone receipt becomes real AAPLx in a wallet in under 3 minutes, and every proof link opens.

## Glossary

| Word | Means |
|---|---|
| Jar | A user's USDC set aside in the vault for one asset (Apple, TSMC, Gold…). It fills from purchases and buys at $5. |
| Free balance | USDC that is the user's and not in a jar. It is shown as "Free to use". |
| Maker | The company that owns the brand (iPhone → Apple). |
| Behind the product | Suppliers named in public filings or supplier lists, with a quoted source sentence. |
| Raw materials | Materials in the product that have a liquid token (today gold and silver). |
| Fallback | Where the money goes when no company is buyable (S&P 500 by default). |
| Venue | The chain and DEX where an asset is cheapest to buy all-in (Solana · Jupiter first; Base, Ethereum, Arbitrum, BNB). |
| BuyApproval | The user's signature naming assets, amounts, venue, max price and max fee. The vault won't buy without it. |
| Relay | Our wallet on a venue chain. USDC lands there for about a minute between the cross-chain transfer and the swap. |
| Proof trail | The 0G request ID, Arc tx, CCTP message, venue tx and Arkiv record behind each buy. |
| Keeper | The backend job that executes approved buys, using a Circle developer-controlled wallet. |
