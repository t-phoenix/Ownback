# Ownback · Funding and go-to-market roadmap

Researched 10 Nov 2026. This is business planning, not a build spec: it sits outside the truth order in [docs/AI_BUILD.md](../docs/AI_BUILD.md). Every deadline and amount below came from web search, and many sources were third-party aggregators. **Open each link and confirm the terms before you apply.** Items marked ⚠ had conflicting sources.

---

## 1 · The uncomfortable finding first: you're not alone

"Shop, get tokenized stock of the brand" already shipped in 2026 from at least five teams:

| Who | What | Chain / issuer | Backed by |
|---|---|---|---|
| **SP3ND Stockbacks** (launched 17 Sep 2026) | Up to 3% of stablecoin purchases back as xStocks of the brand (Amazon, Walmart, Apple, Nike…) | Solana · xStocks | — |
| **Crumbs** | Shopping receipts → stock tokens, up to 5% back; has a `$CRUMBS` token | Robinhood Chain | Described as Robinhood Chain-backed |
| **Receipt** (Sep 2026) | Submit receipts → tokenized-stock reward, funded by `$RECEIPT` trading fees | — | — |
| **Bitget Wallet Card "Assetback"** (1 Aug 2026) | Card cashback in BTC, gold or xStocks, up to 3% | xStocks | Bitget |
| **StockBack** (open source, GitHub `stockbackrh`) | Photo of receipt / order email → tokenized share on Robinhood Chain | Robinhood Chain | — |
| *Bumped (dead, Dec 2022)* | Brand-funded fractional shares for shopping | Apex brokerage | $30M raised; died when merchants stopped paying |

Sources: [SP3ND](https://solanacompass.com/news/sp3nd-launches-stockbacks-stablecoin-shoppers-earn-tokenized-equity-in-amazon-walmart-nvidia-and-more) · [Crumbs](https://coingape.com/block-of-fame/pulse/crumbs-robinhood-chain-backed-startup-pushes-stock-tokenization-into-shopping-rewards/) · [Receipt](https://www.manilatimes.net/2026/09/11/tmt-newswire/globenewswire/receipt-announces-availability-of-tokenized-stock-rewards-for-eligible-consumer-purchases/2423541) · [Bitget Assetback](https://www.globenewswire.com/news-release/2026/08/01/3337111/0/en/Bitget-Wallet-Card-Turns-Cashback-Into-Bitcoin-Gold-and-Tokenized-Stocks.html) · [StockBack](https://github.com/stockbackrh/stockback) · [Bumped shutdown](https://www.doctorofcredit.com/bumped-app-earn-stock-rewards-on-retail-purchases-by-linking-a-card)

**What this means:** "stock-back" is now a feature, not a company. Grant reviewers and investors will ask "how is this different from SP3ND?" in the first minute. Your pitch must lead with what only Ownback does:

1. **The supply chain, not just the brand.** An iPhone buys Apple *and* TSMC *and* the copper/lithium in it. Nobody above does suppliers or commodities. This is the "next trillion in RWA and commodities" story; it is your wedge.
2. **The user's own money, self-custodied.** Competitors give *rewards* funded by a token or by merchants (Bumped proved merchant funding dies). Ownback sets aside the user's own savings into jars and the user signs every buy. No token, no merchant dependency.
3. **Any receipt, any shop** (AI receipt reading, Gmail order emails), not a card or a partner-merchant list.
4. **India / emerging-market first**, where none of the above focus.

Fix in the deck: never say "cashback in stocks". Say **"your spending becomes ownership of the whole supply chain."**

## 2 · Who might copy you (and how to handle each)

You can't patent this, and the idea is already public. Protection = speed + distribution + data you don't publish. Rank by risk:

| Entity | Risk | Why | How to engage |
|---|---|---|---|
| **Kraken / xStocks** | High | They already power SP3ND and Bitget Assetback. Adding "supply-chain baskets" is a small step for them | Engage as a **supplier/partner**, not a pitch. Ask for listing, co-marketing, xPoints integration. Share traction, never the supplier-graph method |
| **Bitget Wallet** | High | Already shipped asset-cashback; fast copier culture | Don't pitch. Monitor |
| **Robinhood** | High | Backs Crumbs; owns brokerage + chain + Gold card | Avoid their Open House unless you'd build on Robinhood Chain. Crumbs is already their horse |
| **Coinbase / Base** | Medium | Big consumer app, can add anything | Fine for grants (small); keep the graph private |
| **Ondo** | Low–Medium | Issuer, not a consumer app; wants distribution | Good partner: more stock coverage (450+ names) for your supplier graph |
| **Solana Foundation, Superteam, Colosseum, Circle, 0G, Arkiv** | Low | Ecosystem funders; they win when you win, don't build consumer apps | Best first money |
| **Accelerators (Alliance, YZi)** | Low | Invest, don't build | Normal |

**Practical rules**
- Your product→supplier→commodity graph is the moat. Today the registry writes it to **Arkiv publicly** ([database/arkiv-schema.md](../database/arkiv-schema.md)). Anyone can read and copy it. Decide: publish only buy proofs, keep the curated graph (or its newest/best part) server-side.
- In calls with exchanges/issuers: show the demo and user numbers; don't walk through how the graph is built or which data sources feed it.
- NDAs: VCs won't sign; partners sometimes will. Ask exchanges for a mutual NDA before any data-sharing discussion.
- Keep a dated public trail (this repo, ETHGlobal submission, X posts) so priority is provable.

## 3 · Where to apply (exact links)

### Tier 1 · apply this week (fast, non-dilutive, low theft risk)

| Program | Amount | Why you fit | Link |
|---|---|---|---|
| **Superteam India · Solana Foundation & CoinDCX Instagrants** | Up to $15k, decision ~72h | India-based, Solana buys, consumer | https://in.superteam.fun/instagrants/solana-foundation-coindcx-india-grants · also https://superteam.fun/earn/grants/solana-foundation-india-grants/ |
| **Superteam Moonshot Fund** | $20k one-time | "Consumer apps that could bring thousands of new users on chain" — exactly the 1,000-user goal | https://in.superteam.fun/instagrants/moonshots |
| **Circle Developer Grants** (relaunched May 2026, milestone-based, paid in USDC) | ⚠ up to $100k reported, unconfirmed | Built on Arc + CCTP + USDC; ETHGlobal Arc track | https://www.circle.com/grant · [relaunch post](https://community.arc.io/public/blogs/circle-developer-grants-program-relaunches-2026-05-14) |
| **Arc Builders Fund** (Circle Ventures, equity) | Discretionary | "Always-on markets", "off-chain assets" are named focus areas | Waitlist on https://www.circle.com/blog/introducing-the-arc-builders-fund · Arc House: https://www.arc.network/community |
| **Alliance (ALL19)** | Funding on admission (⚠ terms vary) | Consumer + fintech crypto accelerator | https://alliance.xyz/apply · ⚠ one guide says regular admission closes **18 Nov 2026**; cohort starts 11 Jan 2027. Confirm on site today |

### Tier 2 · apply within 30 days

| Program | Amount | Link |
|---|---|---|
| **Solana Foundation grants** (rolling; convertible track for commercial projects) | ⚠ varies | https://solana.org/grants |
| **Solana Request for Startups** (published 9 Nov 2026; Head of Consumer Pedro Miranda's consumer-finance idea is closest) | via Solana Builder Program | [RFS summary](https://solanacompass.com/news/solanas-new-request-for-startups-lists-11-ideas-from-housing-futures-to-ai-wallet-advisors) — find the apply link from the Foundation's post |
| **0G Ecosystem Growth Program** ($88.88M pool) / **Guild on 0G** ($8.88M) / **Apollo Accelerator** (up to $2M) | Grants + credits | https://0g.ai/blog/0g-ecosystem-program · https://www.0gfoundation.ai/ecosystem — your receipt AI runs on 0G TEE models; lead with that |
| **Golem Ecosystem Fund** (covers Arkiv builders) | Staking-reward funded | https://golem.network/ecosystem |
| **Ethereum Foundation ESP** (wishlist/RFP model; weak fit unless you build a public good, e.g. an open receipt-parsing standard) | Grant | https://esp.ethereum.foundation/applicants |
| **ETHGlobal partner follow-ups**: email the Arc, 0G and Arkiv judges/DevRel you met in Mumbai with the demo link and a 3-line ask | — | Use the ETHGlobal Mumbai partner Discord channels |

### Tier 3 · bigger cheques, once you have users (dilutive)

| Program | Terms | Link |
|---|---|---|
| **Colosseum accelerator** (via the next Solana hackathon) | $250k pre-seed per team | https://colosseum.com — watch for the next hackathon after Crypto World's Fair; submit Ownback's Solana leg |
| **BNB Chain MVB** (rolling, 3x/year) | Up to $500k (YZi) | https://www.bnbchain.org/en/programs/mvb — needs core transactions on BNB; only if you turn on the BNB venue (docs/03 Q5) |
| **YZi Labs EASY Residency** (rolling) | Up to $500k | https://www.yzilabs.com/blog/yzi-labs-easy-residency-expands-to-a-year-round-program-with-season-3-demo-day-at-token2049-dubai-april-2026 · apply link used across seasons: `wkf.ms/3IA5iBk` |
| **a16z speedrun** (CSX has no 2026 cohort) | ~$500k-1M ⚠ | https://speedrun.a16z.com — ⚠ an aggregator listed a 1 Nov deadline; check for next batch |
| **Hyperliquid** | No standing grant (only a one-off USDH migration fund) | Skip |
| **Robinhood Chain / Arbitrum Open House** | Up to $100k per grant ⚠ | Skip unless you deploy there; Crumbs already occupies the slot |
| **Ondo** | No public grant program found | Partner for coverage, not money |

### Exact people (verified names only)

| Person | Role | Ask |
|---|---|---|
| **Val Gui** | General Manager, xStocks (Kraken) | Listing/partner status, co-marketing, xPoints for Ownback buyers. Reach via LinkedIn or a warm intro from Superteam/Solana |
| **Pedro Miranda** | Head of Consumer, Solana Foundation | Solana grant + RFS fit. Reach via Superteam India intro |
| xStocks BD team | Kraken is hiring a "Principal, Business Development – xStocks" ([posting](https://jobs.dcg.co/companies/kraken/jobs/60575019-principal-business-development-xstocks)) — the team exists to sign wallets/apps like you | Ask Val Gui to route you |

I did not find verified names for Circle Arc DevRel, 0G or Superteam India leads; get them from the ETHGlobal Mumbai partner channels and Superteam India's site rather than guessing.

## 4 · Before you take money: the legal gate

You run **mainnet money** and plan to start in India. Two blockers to clear with a lawyer before user #101:

- **India:** tokenized US stocks are taxed as virtual digital assets (30% flat + TDS), and **FEMA/LRS treatment is unsettled** as of mid-2026 ([source](https://letsdatascience.com/news/indians-purchase-tokenised-us-stocks-anytime-60f9faad)). Get a written opinion from a FEMA/crypto counsel.
- **US persons:** xStocks are not offered to US persons. Geo-block US and other restricted jurisdictions in the app and the terms.
- Entity: grants pay a legal entity. Most crypto founders from India use a Delaware C-corp (for VCs) or a BVI/Cayman foundation + Indian services company. Decide with counsel; Colosseum/Alliance will expect a Delaware or similar structure.

## 5 · How Ownback makes money

| Revenue | How | When |
|---|---|---|
| **Buy fee** | 0.5–1% on each jar buy, shown inside the existing fee cap (`maxFeeBps`, docs/03 Q2) | From user #1 |
| **Swap referral fee** | Jupiter lets integrators take a platform fee on swaps (check current terms) | From user #1 |
| **Issuer/partner incentives** | xStocks/Ondo distribution deals, xPoints | After 500 users |
| **Ownback Plus** (₹99–199/month) | Auto-read Gmail receipts, more jars, price alerts, family jars | After 1,000 users |
| **Data/API** (B2B) | Anonymised "supply-chain ownership" graph and receipt-to-ticker API for wallets/neobanks — sell the thing others would copy | After 5,000 users |
| **Avoid** | Brand-funded rewards as the core model (Bumped died of this); launching a token to fund rewards (Crumbs/Receipt path — regulatory and reputation risk) | — |

## 6 · The rigid roadmap (10 Nov 2026 → 31 May 2027)

Rule: **nothing moves to the next phase until its exit gate is met.** No gate, no next step.

### Phase 0 · Lock it down (10 Nov → 24 Nov 2026)
- [ ] Apply: Superteam India Instagrant, Moonshot Fund, Circle grant, Arc Builders Fund waitlist, Alliance ALL19 (if 18 Nov is real)
- [ ] Book a FEMA/crypto lawyer; geo-block US
- [ ] Decide what stays off Arkiv (supplier graph)
- [ ] 1-page deck with the "whole supply chain" wedge and a competitor slide (SP3ND, Crumbs, Bitget) — show you know them
- [ ] Brand clean-up with the branding team (in progress)
- **Exit gate:** 5 applications sent, legal call booked

### Phase 1 · First 100 users (25 Nov → 31 Dec 2026)
- [ ] Closed beta: friends, ETHGlobal Mumbai community, Superteam India members. Invite-only, $50 deposit cap per user while legal is pending
- [ ] Track weekly: receipts scanned, jars filled, buys signed, 30-day retention
- [ ] Apply: Solana Foundation grant, 0G ecosystem, Golem fund
- [ ] Message Val Gui (xStocks) and Pedro Miranda (Solana) with demo + numbers
- **Exit gate:** 100 users, ≥40 made a real buy, legal opinion in hand, ≥$15k non-dilutive raised

### Phase 2 · 1,000 users (Jan → Mar 2027)
- [ ] Open the waitlist; referral: both get their first jar buy fee-free
- [ ] Content loop: "My iPhone made me own TSMC and copper" — receipt-to-ownership posts on X/Instagram
- [ ] Campus ambassadors via Superteam India chapters
- [ ] Enter the next Colosseum hackathon with the Solana leg (target the $250k accelerator)
- [ ] Turn on buy fee + Jupiter platform fee
- **Exit gate:** 1,000 users, ≥300 monthly active buyers, ≥25% 60-day retention, first revenue

### Phase 3 · Raise the pre-seed (Mar → May 2027)
- [ ] Raise $500k–$1.5M on a SAFE: Colosseum / Alliance / YZi + Circle Ventures + angels from the Solana and Arc ecosystems
- [ ] Hire: 1 growth, 1 compliance/ops
- [ ] Launch Ownback Plus; start the B2B API conversation with 2 wallets
- **Exit gate:** money in the bank for 18 months, 5,000 users target set

### Budget to reach 1,000 users (rough, ~$25–40k)

| Item | Estimate |
|---|---|
| Relay gas + Solana token-account rent (we pay; docs/05) | ~$1–3 per active user → $1–3k |
| 0G inference, RPCs, Neon, Vercel, Render | $300–600/month |
| Legal opinion + entity | $5–15k |
| Referral credits (fee waivers) | $2–5k |
| Content/ambassadors | $3–8k |
| Founder runway | Your call |

Tier 1 + 2 grants alone can plausibly cover this without giving up equity.

---

### Sources

[Solana RFS](https://solanacompass.com/news/solanas-new-request-for-startups-lists-11-ideas-from-housing-futures-to-ai-wallet-advisors) · [Solana grants guide](https://hub.causo.ai/guides/how-to-apply-to-solana-foundation-grants-2026) · [Superteam India grants](https://superteam.fun/earn/grants/solana-foundation-india-grants/) · [Superteam CoinDCX](https://in.superteam.fun/instagrants/solana-foundation-coindcx-india-grants) · [Moonshots](https://in.superteam.fun/instagrants/moonshots) · [Circle grants relaunch](https://community.arc.io/public/blogs/circle-developer-grants-program-relaunches-2026-05-14) · [Arc Builders Fund](https://www.circle.com/blog/introducing-the-arc-builders-fund) · [Arc grants guide](https://builtonarc.app/guides/circle-developer-grants-arc) · [xPoints](https://xstocks.fi/us/news/introducing-xpoints) · [xStocks $25B / Val Gui](https://blog.kraken.com/product/xstocks/25-billion-in-total-transaction-volume) · [xStocks BD role](https://jobs.dcg.co/companies/kraken/jobs/60575019-principal-business-development-xstocks) · [Ondo on Solana](https://ondo.finance/blog/global-markets-live-on-solana) · [Hyperliquid USDH grants](https://crypto.news/hyper-foundation-allocates-10m-in-grants-to-support-usdh-migration/) · [Robinhood Chain grants](https://trustswap.com/robinhood/grants) · [BNB MVB](https://www.bnbchain.org/en/programs/mvb) · [YZi EASY](https://www.yzilabs.com/blog/yzi-labs-easy-residency-expands-to-a-year-round-program-with-season-3-demo-day-at-token2049-dubai-april-2026) · [Colosseum](https://colosseum.com/frontier) · [0G program](https://0g.ai/blog/0g-ecosystem-program) · [Golem fund](https://golem.network/ecosystem) · [EF ESP](https://esp.ethereum.foundation/applicants) · [Alliance 2026 guide](https://hub.causo.ai/guides/how-to-apply-to-alliance-dao-2026) · [a16z CSX guide](https://hub.causo.ai/guides/how-to-apply-to-a16z-csx-2026) · [India tokenized stocks](https://letsdatascience.com/news/indians-purchase-tokenised-us-stocks-anytime-60f9faad)
