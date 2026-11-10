# 12 · Markets: buy and sell assets directly

**Status:** spec, ready to build · **Decided:** D34–D38 in [docs/03](03-decisions-and-open-questions.md) (user, 10 Nov) · **Wireframes:** [markets-wireframes.html](../markets-wireframes.html) · **Build prompt:** [12-markets-build-prompt.md](12-markets-build-prompt.md)

Markets lets a user buy or sell any verified tokenized asset straight away, without saving a purchase into a jar first. It reuses the D29 buy pipeline and the D31 sell pipeline. It adds a market list, an asset page with a price chart, and a trade sheet. App-wide speed work (Home, Holdings, shared caching) is owned by a separate review and is out of scope here (D38).

Venue for this release: **xStocks on Solana via Jupiter** only. Hyperliquid, Robinhood Chain, BNB and others plug into the same `VenueAdapter` later (§12), behind flags, with no UI rewrite.

---

## 1 · Goals and non-goals

### Goals

1. **Direct trading.** From the nav, a user can find an asset, see its price and chart, and buy or sell it in under 30 seconds when their USDC is already on Solana, or under 90 seconds when it is on Arc.
2. **One portfolio.** Anything bought on Markets shows in Holdings right away, with the same cost basis and proof links. Holdings rows open the Markets asset page to trade.
3. **Fast.** The Markets list paints from cache on return visits, and no Markets screen waits on a third-party API to render. Markets must not make the rest of the app slower.
4. **Calm errors.** Every failure has a specific message and a next step. A broken chart never breaks the trade panel, and a slow price never blocks the page.
5. **Same safety bar as jar buys.** User-signed only. The server checks the exact Solana message and the Arc `Withdrawn` event. Fees are simulated, shown and capped by `maxFeeBps`.

### Non-goals (this release)

- Limit orders, stop losses, recurring buys, alerts. (Listed in §14.)
- Leverage, perps, shorting, margin.
- A user-set slippage. Fixed at 100 bps, as jar buys use today.
- Venues other than Jupiter, and chains other than Solana.
- Order books or depth charts. xStocks trade on AMMs; there is no book to show.
- Social features, watchlists synced across devices. (A local "starred" list is in scope; §4.1.)

---

## 2 · Decisions (also recorded in docs/03)

| # | Decision |
|---|---|
| **D34** | **Markets in the nav.** Laptop sidebar: **Markets** after Jars, before Settings, shortcut **M**. Phone tab bar: 4 tabs + centre Add (Home · Holdings · **+ Add** · Receipts · Jars); Markets, Activity and Settings are reached from screen headers and cards (§4.0). Routes: `/markets` (list) and `/markets/[assetId]` (asset page, chart, buy/sell). |
| **D35** | **Market buys reuse the D29/D33 pipeline.** If Solana USDC covers the buy, swap straight away. If not, the shortfall moves from Arc via `withdrawCrossChain` on one Ownback approval sheet (D33), then the user signs the Jupiter swap. `buy_batches.trigger = 'market'`. Market buys **never touch jars** (`debitJars` is skipped). Minimum $0.10, whole cents. |
| **D36** | **Sell proceeds stay as USDC in the user's Solana wallet** (D31). "Move to Arc" stays a separate, optional tap. Sells can be sized by quantity, by %, or by dollar amount. |
| **D37** | **Chart data = our own price ticks + GeckoTerminal OHLCV.** No API key. The chart shows the on-chain xStock price (what the user actually pays), 24/7. Our 1-minute Jupiter snapshots fill short ranges and act as the fallback. Pyth Pro and Birdeye are not used. |
| **D38** | **App-wide speed work is out of scope here.** A separate session owns it (portfolio prices, `useApi` caching, shared price cache). Markets doesn't rewrite those; it only avoids adding slow paths (§9). Gaps get their own change after that review. |

---

## 3 · Users and stories

| As a… | I want to… | So that… |
|---|---|---|
| Saver who already has jars | buy more Apple now, without adding a receipt | I can top up when the price dips |
| Holder | sell part of a holding and get USDC | I can use the money elsewhere |
| Browser | see what's available and how it moved today | I can decide what to own next |
| Holder | see my position, average cost and P/L next to the chart | I know where I stand before trading |
| Anyone on a slow phone | see prices immediately, even if a few seconds old | the app feels instant |

---

## 4 · Screens and flows

Layout and look: [markets-wireframes.html](../markets-wireframes.html). Brand: Ledger Green, Bricolage Grotesque for numbers and titles, Source Sans 3 for body, JetBrains Mono for addresses ([frontend/design-tokens.md](../frontend/design-tokens.md)). Up is `--good`, down is `--bad`; neither colour is the only signal (always a ▲/▼ glyph and a sign).

### 4.0 · Navigation

**Laptop (≥ 900 px): sidebar, as before.**

Add a purchase (button) → Home · Holdings · Receipts · Jars · **Markets** · Settings → Activity. Keyboard: **M** opens `/markets`; **/** focuses the market search on `/markets`.

**Phone (< 900 px): 4 tabs + centre Add.**

`Home · Holdings · (+ Add) · Receipts · Jars`. The raised Add disc is centred again. Swipe-between-tabs covers these four only. Settings and Markets leave the tab bar, so every phone screen header carries the entry points:

| Screen | Header (right side) | In the page |
|---|---|---|
| Home `/` | **Markets** icon button · **Activity** bell (unread dot) · **Settings** gear | **Everything on Home today stays**, including the **Next buy** jars card (mini jars, "Review and buy N jars" → `/jars`), the waiting stack and the jar brands strip. **Add** one **Markets card** after the Next buy card: "Markets" eyebrow, US-market chip, top 3 movers (icon · token · price · 24h pill), "See all markets →". Tapping a mover opens its asset page |
| Holdings `/holdings` | **Jars** icon button (`PiggyBank`) · **Markets** icon button · **Activity** bell | A **"In jars $X · Go to Jars →"** row in the Dollars section (→ `/jars`). "Buy more" on each held row's detail (§4.5). Empty state: "You don't own anything yet." with **Browse Markets** (primary) and **Go to Jars** (secondary) |
| Receipts `/receipts` | **Activity** bell | — |
| Jars `/jars` | **Activity** bell | — |
| Markets `/markets`, asset page | Back arrow (to where the user came from, default Home) | — |
| Settings `/settings` | Back arrow | Unchanged content |

- Header icon buttons are 40×40 touch targets with `aria-label`s ("Markets", "Activity, 2 new", "Settings"). Icons: `ChartCandlestick` (fallback `TrendingUp`), `PiggyBank` (Jars), `Bell`, `Settings`, Lucide 22 px, stroke 1.75.
- The Activity bell shows a dot when there are unseen events (existing `/api/activity` data; no new endpoint).
- `/markets`, `/markets/[id]`, `/settings` and `/activity` are pushed screens on phone (no tab bar, back arrow), matching how `/activity` already works.
- `screens-and-routes.md` tab-bar line changes to: **Home · Holdings · + Add · Receipts · Jars** (phone) and the sidebar list above (laptop).

### 4.1 · Markets list · `/markets`

**Job:** find an asset and see how it is moving.

Top to bottom:

1. **Title row:** "Markets" + a small market-status chip: `US market open` / `US market closed · prices move 24/7 on-chain` (§6.5).
2. **Search** (sticky under the header on phone): matches name, ticker (AAPL), token (AAPLx), alias. Client-side over the cached list; no request per keystroke.
3. **Filter chips:** All · Yours · Starred · Stocks · ETFs · Commodities. "Yours" is first when the user holds anything. Starred is stored in `localStorage` (per device; try/catch).
4. **Sort control:** Popular (default; by 24h volume) · Top gainers · Top losers · A–Z.
5. **"Your assets" strip** (only if the user holds any): horizontal cards (logo, token, value, 24h change). Tap → asset page.
6. **Asset rows** (virtualised; 834 verified rows today): token icon (or monogram tile) · name + token (`Apple · AAPLx`) · 24h sparkline (48×20, no axes) · price · 24h change pill. The whole row is one button → `/markets/[assetId]`. Hover or entering the viewport prefetches the asset detail (§9).

**States:** first load skeleton (8 rows; no spinner) · cached paint + quiet refresh · price stale (> 2 min): price in `--muted` with "2 min ago" · search no match ("No asset called 'xyz'. Try the ticker, like AAPL.") · offline (cached list + banner) · error with retry (only if there is no cache at all).

**Laptop (≥ 900 px), wireframe E0:** sidebar on the left (Markets active). Main area: title row with US-market chip, search (`/`), filter chips and sort. Below, a **table** (virtualised rows, sticky header): Asset (icon, name, token) · Price · 24h · 7d sparkline · 24h volume · Your position (value, or "—") · star. Column headers sort. A **preview panel** (320 px, sticky right) shows the selected row: price, 1D mini chart, 24h high/low, your position, and **Buy** / **Sell** / "Open full page →". Clicking a row selects it; double-click or Enter opens `/markets/[assetId]`. Arrow keys move the selection.

### 4.2 · Asset page · `/markets/[assetId]`

**Job:** understand the price and act.

**Phone (one column):**

1. Header: back · asset icon · `Apple Inc.` · `AAPLx · Solana` · star toggle.
2. **Price block:** price in Bricolage `--t-hero` · change for the selected range (`▲ $3.12 · 1.38% today`) · "Updated 12s ago" in `--t-small` when > 10 s.
3. **Chart** (§6): area line by default, candle toggle. Range chips: **1D · 1W · 1M · 3M · 1Y · All**. Touch-drag shows a crosshair with price and time and updates the price block live; release restores it. Height 240 px phone / 360 px laptop.
4. **Your position card** (if held): qty · value · avg cost · P/L $ and % · "In Holdings →".
5. **Stats grid:** 24h high/low · 24h volume · liquidity (top pool) · issuer · mint (mono, copy) · decimals.
6. **About:** one-line description from the catalog + "Tracks Apple Inc. (NASDAQ: AAPL). Issued by Backed as an xStock." + issuer link.
7. **Activity with this asset:** last 5 buys/sells (jar or market), each → its progress page.
8. **Dock (sticky bottom):** `Sell` (secondary; hidden if nothing held) · `Buy` (primary).

**Laptop (≥ 900 px):** two columns (wireframe E1). Left (fluid): price block, chart, stats, about, activity. Right (360 px, sticky): the trade panel inline (Buy/Sell tabs) instead of a sheet.

**States:** loading (skeleton price + chart shimmer) · not tradable (`tradable.buy = false`: dock shows "Not tradable right now" + reason) · chart unavailable (panel keeps working; see §8) · not found (unknown or unverified assetId → "We don't list this asset" + back to Markets).

### 4.3 · Trade sheet (phone) / trade panel (laptop)

Tabs: **Buy · Sell**. Opening the sheet starts a quote immediately.

**Buy**

- Amount input in dollars (Bricolage, large), numeric keypad. Quick chips: $5 · $10 · $25 · $50 · Max.
- "Max" = Solana USDC + (Arc USDC − $0.10 gas buffer).
- Live preview (refreshes 500 ms after typing stops and every 15 s): "You get ≈ 0.1432 AAPLx" · price per token · fees in $ and % (`Jupiter route $0.04 · 0.16%`; bridge "< $0.01" when used) · "Pays from: $12.00 Solana USDC + $13.00 from Arc".
- Quote countdown ring (15 s). At 0 it refreshes silently; never asks the user to retry a timer.
- Primary action: **Slide to buy** on touch, button on mouse/keyboard (same as jar buys, design-tokens §Gestures).
- Validation (inline under the input, never a toast): below $0.10 · above Max ("You have $25.00 free. Add funds →") · fees over limit ("Fees are 6.2%, over your 5% limit. Change fee limit →") · no route.

**Sell**

- Toggle: **$ amount · Quantity**. Chips: 25% · 50% · 75% · Max.
- Preview: "You get ≈ $24.81 USDC in your Solana wallet" · fees · price.
- Primary: **Slide to sell**.
- Note under it: "USDC stays on Solana for your next trade. You can move it to Arc any time."

**Approval:** tapping/sliding builds the actions. When Arc is involved, the D33 one-approval sheet lists each Arc step, then signs headless with live status. The Solana swap is signed headless. The user never sees a raw wallet popup in the happy path.

### 4.4 · Trade progress and done

Reuses the existing screens, extended:

- Buy → `/buy/[batchId]` (BuyDone). For `trigger = 'market'`: title "Bought 0.1432 AAPLx", no jar lines, CTA "View in Holdings" + "Back to Apple".
- Sell → `/sell/[sellId]` (SellDone). CTA "Back to Apple" + "Move to Arc".
- Step list (buy, when bridging): Approve on Arc ✓ → Moving USDC to Solana (≈ 20–60 s) → Swap on Jupiter → Done. Every step links to its explorer.
- On done: invalidate `holdings`, `home`, `markets:yours`, `market:{assetId}`; toast "Bought 0.1432 AAPLx".

### 4.5 · Holdings integration

- Holding detail `/holdings/[assetId]`: add **Buy more** and **Sell** buttons → open the Markets asset page with the sheet open (`/markets/[assetId]?trade=buy|sell`). Replaces the existing standalone `/sell/review/[assetId]` entry point (that route keeps working and redirects).
- Holding detail history shows **buys and sells**, each tagged `From jar` or `Market`.
- Cost basis: average cost over all buys; a sell reduces quantity at average cost; realised P/L recorded per sell (`sells.cost_basis_usd6`). Unrealised P/L = value − (avg cost × qty held).
- Holdings rows show a 24h change pill (from the market price data; if that touches `/holdings` performance, leave it for the speed review).

---

## 5 · System design

```
PWA (Next.js 15, React 19)
 ├─ /markets, /markets/[id]  ── existing useApi cache ─────────────────────────┐
 ├─ lightweight-charts (dynamic import, client only)                            │
 └─ sign-action.ts (Privy / seed) · arc-guard.ts                                │
                                                                                ▼
API (Hono on Render)                                        Postgres (Neon)
 ├─ routes/markets.ts  (list, detail, candles, prices, buy review)   price_cache (L2)
 ├─ routes/jars-buys.ts (POST /buys … reused, trigger 'market')      price_ticks (1-min)
 ├─ routes/sells.ts    (review/sell/submit … extended)               candle_cache, market_pools
 ├─ lib/prices/market-prices.ts ← batched price reads for Markets    buy_batches, sells
 ├─ lib/prices/candles.ts        ← GeckoTerminal + ticks merge
 ├─ lib/venues/{venue.ts, jupiter.ts}  ← VenueAdapter
 └─ jobs: price refresher (30 s), tick writer (60 s), pool resolver (daily)
                         │
      Jupiter Price v3 · Jupiter Swap v1 · GeckoTerminal v2 · Solana RPC · Arc RPC · CCTP Iris
```

### 5.1 · Tech stack

| Layer | Choice | Status |
|---|---|---|
| Frontend | Next.js 15, React 19, plain CSS with tokens in `app/globals.css` | existing |
| Server state | Existing `useApi` (`frontend/lib/use-api.ts`). Any change to it belongs to the speed review (D38) | existing |
| Lists | CSS `content-visibility: auto` on rows (834 rows, no library) | built |
| Chart | **TradingView `lightweight-charts` 5.2.1** (Apache-2.0), loaded with `next/dynamic` on the asset page only | **new** |
| Icons | lucide-react | existing |
| API | Hono, zod, `postgres` | existing |
| Chain | `@solana/web3.js`, `@solana/spl-token`, viem (Arc) | existing |
| Wallets | Privy embedded EVM + Solana; seed keys | existing |
| DB | Neon Postgres; SQL migrations in `database/migrations` | existing |

Pin exact versions in the lockfile, latest stable at install time (AI_BUILD § Versions). Keep `lightweight-charts`'s attribution on (license requirement): `layout.attributionLogo: true`.

### 5.2 · Third-party integrations

| Service | Use | Endpoint(s) | Auth | Limits / notes |
|---|---|---|---|---|
| **Jupiter Price v3** | Spot price, batched | `GET lite-api.jup.ag/price/v3?ids=<≤50 mints, comma>` | none (lite) | Rate-limited (429). Always batch; back off; cache. Move to `api.jup.ag` with `JUPITER_API_KEY` if limits bite (env flag, optional) |
| **Jupiter Swap v1** | Quote + build swap | `GET …/swap/v1/quote`, `POST …/swap/v1/swap` | none (lite) | Existing `jupiter-price.ts` / `jupiter-swap.ts` |
| **GeckoTerminal v2** | OHLCV history, top pool, 24h volume/liquidity | `GET api.geckoterminal.com/api/v2/networks/solana/tokens/{mint}/pools` · `GET …/networks/solana/pools/{pool}/ohlcv/{day\|hour\|minute}?aggregate=&limit=&currency=usd&token=base&before_timestamp=` | none | Free tier is ~30 calls/min. **Spike S-MKT-1** confirms paths, limits and xStock pool coverage before building on them. Server-side only, heavily cached |
| **Solana RPC** | Balances, tx confirm, token deltas | existing `RPC_SOLANA` | key in URL | Use one `getParsedTokenAccountsByOwner` per program per request, cached 10 s per user |
| **Arc RPC + CCTP Iris** | Bridge leg (D29) | existing | — | Unchanged |
| **Privy** | Signing | existing | — | Unchanged |
| **Catalog / xStocks** | Asset list, logos, mint evidence | `database/registry/assets-curated.json` (834 verified) | — | Only `verified` mints are listed (AI_BUILD § Never invent) |

No new paid service. New optional env: `JUPITER_API_KEY` (only if lite limits are hit), `MARKETS_ENABLED` (server flag), `NEXT_PUBLIC_MARKETS` (UI flag). Add both to `backend/README.md § Env` and `.env.example` first.

---

## 6 · Prices and charts

### 6.1 · Market prices (`backend/src/lib/prices/market-prices.ts`)

Used by the Markets routes only; `portfolio()`, `/home` and `/holdings` are not changed here (D38). If the speed review has already landed a shared price module by build time, call that instead and skip this file. Either way Markets reads prices in batches, never one request per row.

```ts
type PricePoint = { usd6: bigint; at: Date; source: 'jupiter' | 'cache'; stale: boolean };
getPrices(mints: string[], opts?: { maxAgeMs?: number }): Promise<Map<string, PricePoint>>
getPrice(mint: string): Promise<PricePoint | null>
get24h(mints: string[]): Promise<Map<string, { openUsd6: bigint; changeBps: number }>>
```

- **L1:** in-process `Map`, TTL 15 s.
- **L2:** Postgres `price_cache` (existing table; key `(asset_id, chain)`), upserted on every refresh.
- **Batching:** misses are grouped into chunks of 50 mints, one HTTP call per chunk, chunks in parallel (max 4 concurrent).
- **Single-flight:** concurrent requests for the same chunk share one promise.
- **Stale-while-revalidate:** if a value is older than 15 s but younger than 10 min, return it at once with `stale: false` until 60 s, `stale: true` after; refresh in the background. Only a cold miss with no L2 row waits, and then for at most 2.5 s before returning `null` (the UI shows "Price unavailable").
- **Background refresher:** every 30 s, refresh the **hot set**: every held mint across active users (last 7 days), the top 100 by 24h volume, and mints viewed in the last 10 min. Runs in the API process like `buy-pipeline.ts`'s ticker (`setInterval(...).unref()`), guarded by a Postgres advisory lock so only one instance runs it.
- Money stays `bigint` Usd6 (`usdStringToUsd6`). Never floats on the money path.

### 6.2 · Price ticks (`price_ticks`)

- Every 60 s the refresher writes one row per hot-set mint: `(asset_id, at, usd6)`.
- Retention: 8 days (a nightly delete). This gives 1D and 1W charts and every sparkline without a third party.
- 24h change = latest price vs the tick nearest to now − 24 h. If none, fall back to GeckoTerminal's 24h data, else omit the pill.

### 6.3 · Candles (`backend/src/lib/prices/candles.ts`)

| Range | Interval | Primary source | Fallback |
|---|---|---|---|
| 1D | 5 min | `price_ticks` (aggregated) | GeckoTerminal `minute`, aggregate 5 |
| 1W | 1 h | GeckoTerminal `hour` | `price_ticks` aggregated to 1 h |
| 1M | 4 h | GeckoTerminal `hour`, aggregate 4 | — |
| 3M | 1 d | GeckoTerminal `day` | — |
| 1Y | 1 d | GeckoTerminal `day` | — |
| All | 1 d (≤ 1000) | GeckoTerminal `day` | — |

- **Pool choice:** `market_pools` stores the top pool per mint (highest USD liquidity paired with USDC or SOL, priced in USD), refreshed daily and on a miss.
- **Merge:** for 1D/1W, ticks override the last partial candle so the chart's end equals the live price.
- **Cache:** `candle_cache(mint, range)` with TTL 1D: 60 s · 1W: 5 min · 1M: 15 min · 3M/1Y/All: 1 h. Served stale while refreshing.
- **Shape:** `{ t: unix seconds, o, h, l, c: Usd6 strings }`. The client converts to `Number` **for drawing only**.
- **Sparse data:** fewer than 2 points → `candles: []` and `reason: 'not_enough_history'`. The UI shows a flat "Not enough trading history yet" panel.

### 6.4 · Chart component (`frontend/components/markets/price-chart.tsx`)

- `next/dynamic(() => import('./price-chart-impl'), { ssr: false, loading: <ChartSkeleton/> })`.
- Area series by default (line `--primary`, fill `--primary` at 12% → 0%), candlestick toggle (`--good`/`--bad`). Re-reads CSS tokens on theme change (`matchMedia` + `data-theme` observer).
- Crosshair drives the price block via a callback; values formatted with `lib/money.ts`.
- Range chip change keeps the old series visible (dimmed) until the new one lands. No blank flashes.
- Respects `prefers-reduced-motion` (no animated transitions).
- Live update: when the price poll ticks, `series.update()` the last point. No full reload.
- Wrapped in its own error boundary: on failure, render "Chart unavailable" and keep the rest of the page.

### 6.5 · US market status

`lib/market-hours.ts` (shared, pure): NYSE regular hours 09:30–16:00 America/New_York, Mon–Fri, with a static 2026–2027 holiday list. Returns `open | closed | pre | post`. Display only: on-chain xStocks trade 24/7, and when the US market is closed the chip says so, with the hint that the on-chain price can drift from the last close.

---

## 7 · API contract additions

All routes need a session (cookie) and return `{ error: { code, details } }` on failure with codes from `shared/errors.ts`. **No new error codes**; new reasons go in `details.reason`. Money is `Usd6` digit strings.

### `GET /api/markets`

Query: `sort=popular|gainers|losers|az` (default popular) · `class=stock|etf|commodity` · `yours=1`.
Returns the **whole** verified list in one response (≈ 834 rows, ≈ 90 KB JSON, ≈ 18 KB gzip). The client filters and searches locally. `ETag` + `Cache-Control: private, max-age=15, stale-while-revalidate=120`.

```ts
{
  pricesAt: string,                // oldest price in the payload
  usMarket: 'open'|'closed'|'pre'|'post',
  items: Array<{
    assetId: string; name: string; ticker?: string; token: string; icon?: string;
    class: 'stock'|'etf'|'commodity'|'index'; chain: 'solana';
    priceUsd6: Usd6 | null; change24hBps: number | null;
    volume24hUsd6: Usd6 | null;
    spark: Usd6[];                 // ≤ 24 points, last 24 h, may be []
    held: boolean;
  }>
}
```

### `GET /api/markets/prices?ids=a,b,c`

Up to 50 assetIds. Light poll for visible rows. `{ at, prices: { [assetId]: { priceUsd6, change24hBps, stale } } }`. `Cache-Control: private, max-age=5`.

### `GET /api/markets/:assetId`

```ts
{
  assetId, name, ticker, token, icon, class, chain: 'solana',
  mint, decimals, issuer, about?: string, links: { issuer?: string; mint: string },
  priceUsd6: Usd6 | null, priceAt: string, stale: boolean,
  change24hBps: number | null, high24hUsd6: Usd6 | null, low24hUsd6: Usd6 | null,
  volume24hUsd6: Usd6 | null, liquidityUsd6: Usd6 | null,
  usMarket: 'open'|'closed'|'pre'|'post',
  position: null | { qty: string; valueUsd6: Usd6; avgCostUsd6: Usd6; pnlUsd6: string /* signed */; pnlBps: number },
  tradable: { buy: boolean; sell: boolean; reason?: 'no_route'|'relay_off'|'feature_off'|'nothing_held' },
  funds: { solanaUsdcUsd6: Usd6; arcUsdcUsd6: Usd6; maxBuyUsd6: Usd6 },
  recent: Array<{ kind: 'buy'|'sell'; source: 'jar'|'market'; at: string; qty: string; amountUsd6: Usd6; link: string }>
}
```

`tradable.buy` comes from a cached $1 probe quote (TTL 5 min), never a fresh quote on page load.

### `GET /api/markets/:assetId/candles?range=1D|1W|1M|3M|1Y|ALL`

`{ range, interval: '5m'|'1h'|'4h'|'1d', source: 'ownback'|'geckoterminal'|'mixed', stale, candles: {t,o,h,l,c}[], reason?: 'not_enough_history'|'upstream' }`. `Cache-Control: private, max-age=30, stale-while-revalidate=300`.

### `POST /api/markets/buy/review` (CSRF)

Body `{ assetId, amountUsd6 }` (whole cents, ≥ 100000). Returns the existing buy-review row shape for one asset plus:
`{ quoteId, expiresAt, row, totalUsd6, fees, funding: { solanaUsdc6, arcUsdc6, bridgeUsd6 }, destination }`.
The `quotes.payload` stores `source: 'market'`. Implemented by extracting `buildBuyReview`'s per-row quoting into `lib/trade/quote-buy.ts` and calling it from both routes, so jar review is unchanged.

Errors: `VALIDATION` (amount), `INSUFFICIENT_FREE` (`details.availableUsd6`), `FEES_TOO_HIGH`, `UPSTREAM` (`reason: 'no_route'`), `FEATURE_OFF`, `RATE_LIMITED`.

### `POST /api/buys` (existing, extended)

Unchanged body `{ quoteId }` + `Idempotency-Key`. When the quote's `source = 'market'`: insert `buy_batches.trigger = 'market'`, and skip `debitJars` in both the MOCK path and `/buys/:batchId/swaps/:assetId/submit`. Everything else (Arc calls, CCTP, swap build, message-hash check, token-delta fill) is unchanged.

### Sells (existing, extended)

- `GET /api/sells/review?assetId=&qty=` **or** `&usd6=` **or** `&pct=25|50|75|100`. `usd6` → raw = `usd6 × 10^decimals / price`, floored, capped at held. Response adds `costBasisUsd6` and `pnlUsd6` for the amount.
- `POST /api/sells` body adds optional `source: 'market'|'holding'` (default `holding`); stored on `sells.source`.
- On submit success, store `cost_basis_usd6` (avg cost × qty sold).

### Rate limits

`/markets/buy/review` and `/sells/review`: 20/min/user (they hit Jupiter). `/markets/prices`: 30/min/user. Over the limit → `RATE_LIMITED` with `retryAfterMs`.

---

## 8 · Errors and edge cases

The rule: say what happened, what it means for their money, and the one next step. Copy goes into [frontend/copy-and-errors.md](../frontend/copy-and-errors.md) under a new **Markets** section.

| Situation | Detected by | What the user sees | Behaviour |
|---|---|---|---|
| Jupiter price down / 429 | market-prices | Last price + "Price from 3 min ago" | Serve L2; background retry with backoff |
| No price at all | market-prices null | "Price unavailable" in place of the number; Buy still opens and quotes | Quote is the truth for trading |
| GeckoTerminal down / rate-limited | candles.ts | Chart from our ticks (1D/1W); longer ranges: "Longer history is unavailable right now" | Serve stale cache first |
| Not enough history | candles.ts | "Not enough trading history yet" | Flat panel, trade panel unaffected |
| Thin market (D39) | top pool < $10K or no liquidity reported | Label "Thin market" on row, preview and asset page; Gainers/Losers sort it last | Buy still allowed; fee cap decides |
| No route / thin liquidity | quote null | "Not tradable right now. There's no route for this amount. Try a smaller amount." | Disable slide |
| Fees over limit | `FEES_TOO_HIGH` | "Fees are 6.2%, over your 5% limit." + "Change fee limit" | Never auto-raise |
| Not enough USDC | `INSUFFICIENT_FREE` | "You have $25.00 free." + "Add funds" | Max chip fills the real max |
| Quote expired | `QUOTE_EXPIRED` | nothing (silent re-quote) | Re-quote and keep the sheet open |
| Price moved beyond slippage | swap sim fails / `PRICE_MOVED` | "The price moved while you were signing. Here's a new quote." | New quote; user slides again |
| Relay not configured | `KEEPER_DISABLED` | "Trading is paused for a moment. Your money hasn't moved." | Buy/Sell disabled, page works |
| Bridge slow (> 3 min) | batch status | "Still moving your USDC to Solana. This can take a few minutes." | Keep polling; push when done |
| Swap fails after bridge | entry `paused` | "Your $25.00 is safe in your Solana wallet. Try the swap again." + Retry | `/buys/:id/retry`; **no jar return** for market buys |
| User cancels signing | sign-action throws | "Cancelled. Nothing was sent." | Back to the sheet |
| Selling more than held | `VALIDATION` qty | "You have 0.1432 AAPLx." | Max chip |
| Unknown / unverified asset | `NOT_FOUND` / `FEATURE_OFF` | "We don't list this asset." | Link to Markets |
| Offline | `OFFLINE` | Cached screens + "You're offline. Prices may be old." Buy/Sell disabled | Reconnect refetches |
| Feature flag off | `FEATURE_OFF` | Markets hidden from nav | — |

**Error boundaries:** one per section of the asset page (price block, chart, position, stats, trade panel) and one per list. A thrown render error shows a small "This part didn't load · Retry" card and reports to the existing logger with the request ID. Never a white screen.

**Number edge cases:** prices < $0.01 show 4–6 significant decimals; qty shows up to the mint's decimals, trimmed; buy amounts are whole cents; P/L shows sign and `−` (U+2212).

---

## 9 · Performance

App-wide speed (Home, Holdings, `portfolio()`, `useApi`) is owned by a separate review (D38) and is **not** part of this build. Markets must only not add slow paths:

- **Server:** batch price reads (§6.1); no Markets request waits more than **2.5 s** on a third party (return cached data with `stale: true`); candles and the list are cached server-side; gzip on the Markets JSON.
- **Position data:** `/markets` (`held` flags) and `/markets/:id` (position) call the existing `portfolio()` once per request, never per row.
- **Client:** use the existing `useApi`. Poll prices only for rows in the viewport (IntersectionObserver), one batched `/markets/prices` call every 15 s, paused when the tab is hidden; the asset page polls its one price every 10 s.
- **List:** rows use `content-visibility: auto` (64 px intrinsic size) so off-screen rows skip layout; sparklines are inline SVG, no chart library in the list.
- **Code-split:** Markets screens and the chart are dynamic imports; the main bundle grows by ≤ 10 KB gz.
- **Prefetch** the asset detail on row hover (laptop) or after 300 ms in view (phone).
- **After a trade:** `refreshAll()` (existing) so Holdings and Home show it.

| Metric | Budget |
|---|---|
| `/markets` cold, mid phone, 4G | LCP < 1.8 s |
| `GET /api/markets` p95, warm | < 150 ms |
| Asset page to chart drawn (prefetched) | < 400 ms |
| Scroll the full list | 60 fps, no long tasks > 50 ms |
| JS added to the initial bundle | ≤ 10 KB gz |

Notes for the speed review (found while writing this spec; not acted on here): [portfolio.ts:64](../backend/src/lib/portfolio.ts) awaits one Jupiter price per holding in a loop, each call can sit in 1+2+4+8 s of 429 backoff, the price cache is per process and 15 s, and `useApi` has no in-flight dedupe.

---

## 10 · Data model (migration `0007_markets.sql`)

```sql
-- price history for sparklines, 1D/1W charts and 24h change
CREATE TABLE IF NOT EXISTS price_ticks (
  asset_id text        NOT NULL,
  at       timestamptz NOT NULL,
  usd6     bigint      NOT NULL CHECK (usd6 > 0),
  PRIMARY KEY (asset_id, at)
);
CREATE INDEX IF NOT EXISTS price_ticks_at_idx ON price_ticks (at);

-- cached OHLCV per mint and range
CREATE TABLE IF NOT EXISTS candle_cache (
  mint       text        NOT NULL,
  range      text        NOT NULL CHECK (range IN ('1D','1W','1M','3M','1Y','ALL')),
  source     text        NOT NULL,
  payload    jsonb       NOT NULL,
  fetched_at timestamptz NOT NULL,
  PRIMARY KEY (mint, range)
);

-- top pool per mint for GeckoTerminal OHLCV, volume, liquidity
CREATE TABLE IF NOT EXISTS market_pools (
  mint            text PRIMARY KEY,
  pool_address    text        NOT NULL,
  dex             text,
  liquidity_usd6  bigint,
  volume24h_usd6  bigint,
  checked_at      timestamptz NOT NULL
);

-- market buys
ALTER TABLE buy_batches DROP CONSTRAINT IF EXISTS buy_batches_trigger_check;
ALTER TABLE buy_batches ADD CONSTRAINT buy_batches_trigger_check CHECK (trigger IN ('approval', 'user', 'market'));

-- sells: where they started, and cost basis for realised P/L
ALTER TABLE sells ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'holding' CHECK (source IN ('holding','market'));
ALTER TABLE sells ADD COLUMN IF NOT EXISTS cost_basis_usd6 bigint;
ALTER TABLE sells ADD COLUMN IF NOT EXISTS error text;
```

`price_cache` (existing) is the market-prices L2 (shared table; coordinate with the speed review if it changes it). Also add these to [database/schema.md](../database/schema.md).

Shared constants (spec first, then `backend/src/shared/`): `states.ts` → `TRADE_SOURCES = ['jar','market','holding']`, `BATCH_TRIGGERS` add `'market'`; new `shared/markets.ts` → `CHART_RANGES`, `MARKET_SORTS`, `US_MARKET_STATES`. Frontend imports these, never retypes them.

---

## 11 · Security and privacy

- **Signing is unchanged:** Arc steps pass `arc-guard.ts` (only setSolanaRecipient / approve / deposit / withdrawCrossChain to the one vault); Solana swaps pass `verifyAction` (fee payer = relay, the user is the only other signer, input/output mints match the trade). The server only submits the exact message hash it built.
- **Only verified mints** are listed or tradable. `assetId` from the URL is resolved through `verifiedMint(assetId, 'solana')`; anything else is `NOT_FOUND`.
- **Reference price check (A4):** a quote whose implied price is more than 2% off the market-prices reference is refused with `PRICE_MOVED` (protects against a thin, manipulated pool).
- **Third-party data is display-only.** GeckoTerminal never feeds a money calculation; Jupiter quotes and on-chain token deltas do.
- **No PII to third parties.** Price and candle calls carry mints only, server-side. Never wallet addresses.
- **Logs:** no addresses or amounts tied to a user ID in plain logs (docs/06).
- **Rate limits** as §7. Idempotency keys on `POST /buys` and `POST /sells`.
- **Legal copy** on the asset page footer: "xStocks are tokens issued by Backed that track a share price. They aren't shares and don't carry voting rights. Not available to US persons. Not investment advice." (Confirm the exact issuer restrictions against xStocks' terms before launch: checklist item.)

---

## 12 · Venue adapters (for Hyperliquid, Robinhood, BNB later)

```ts
// backend/src/lib/venues/venue.ts
export interface VenueAdapter {
  id: 'jupiter' | 'hyperliquid' | 'robinhood' | 'pancakeswap';
  chain: 'solana' | 'hyperevm' | 'robinhood' | 'bnb';
  enabled(): boolean;                                   // env flag VENUE_*
  listMarkets(): Promise<MarketListing[]>;              // verified only
  quoteBuy(assetId: string, amountUsd6: bigint): Promise<VenueQuote | null>;
  quoteSell(assetId: string, amountRaw: bigint): Promise<VenueQuote | null>;
  buildBuy(user: User, q: VenueQuote): Promise<SignableAction>;
  buildSell(user: User, q: VenueQuote): Promise<SignableAction>;
  confirmFill(user: User, txId: string, assetId: string): Promise<{ qtyRaw: bigint; usdcDelta: bigint }>;
  candles?(assetId: string, range: ChartRange): Promise<Candle[]>;
}
```

This release ships `jupiter.ts` only, wrapping the existing `jupiter-price.ts` / `jupiter-swap.ts`. Markets rows carry `chain` and later a `venue`; the UI already renders a chain tag. Adding a venue = an adapter + verified mints + a flag. No screen changes.

---

## 13 · Testing

| Layer | Tests |
|---|---|
| Unit (vitest) | market-prices: batching into 50s, single-flight, SWR ages, 2.5 s timeout · candles merge and aggregation · `usd6 → raw` sell sizing (floor, cap at held) · cost basis and P/L (bigint) · market-hours incl. holidays and DST · largest-remainder untouched |
| API (vitest, `MOCK_CHAIN=1`) | `/markets` shape, sort, `held` flags · `/markets/:id` for held / not held / unknown · `/markets/:id/candles` each range + upstream down · `/markets/buy/review` errors · `POST /buys` with a market quote creates `trigger='market'` and **does not change jar totals** · sells by `usd6` and `pct` |
| Frontend | Playwright: Markets list → search "aapl" → asset → Buy $5 → done → Holdings shows it · Sell 50% → USDC on Solana · offline banner · chart error boundary (block GeckoTerminal route) · 375 px and 1280 px screenshots, light and dark (`pnpm shots` with fixtures) |
| Perf | Script hits `/api/markets` and `/api/markets/:id` 50× and asserts p95 budgets; Lighthouse CI on `/markets` with fixtures |
| Mainnet smoke | $1 AAPLx buy from Solana USDC; $1 buy needing Arc bridge; sell 50%; logged in [tx-log.md](tx-log.md) |

`pnpm check` must pass (typecheck, lint, unit tests).

---

## 14 · Rollout and later

**Spikes first:** S-MKT-1 GeckoTerminal (paths, rate limit, pool coverage for the 20 most-held xStocks) · S-MKT-2 Jupiter batch price with 50 ids (latency, 429 behaviour).

**Spike results (10 Nov 2026):**
- **S-MKT-2 Jupiter batch price · pass.** 50 ids per call in ~0.4 s. Each row also carries `priceChange24h` (percent) and `liquidity` (USD), so the list's 24h change and "Popular" sort (by pool liquidity) need no other source. **Only ~30% of the 834 verified xStocks have a `usdPrice`**: the rest have no on-chain liquidity. Browse hides unpriced assets; search, Yours and Starred still find them ("No live price"), and their asset page shows "Not tradable right now". The spike also showed a `scaledUiConfig.multiplier` (≈1.003) on xStocks, which the existing portfolio valuation ignores; left for the speed/valuation review (D38).
- **S-MKT-1 GeckoTerminal · pass with limits.** `tokens/{mint}/pools` and `pools/{pool}/ohlcv/{minute|hour|day}` work for xStock pools (AAPLx/USDC on Raydium CLMM). The free tier returned 429 after ~6 calls in a minute from one IP, so the server budgets 20 calls/min, backs off 60 s on a 429, caches pools for 24 h and candles per range in Postgres, and uses our own ticks for 1D. GeckoTerminal supplies 24h volume on the asset page only.

**Built (10 Nov):** all four phases below, behind the flags. Differences from the plan: the list uses CSS `content-visibility` instead of `@tanstack/react-virtual` (no new dependency); the list's third column is pool liquidity, not 24h volume (Jupiter gives liquidity in the same batch); `/markets/:assetId` gets `position` from the existing `portfolio()` and never changes it (D38).

**Phases:**
1. Nav (laptop sidebar + phone 4 tabs, header entry points, Home Markets card) + Markets list + `/api/markets` + ticks job.
2. Asset page + candles + chart.
3. Trade sheet: market buy review, `trigger='market'`, sells by $/%.
4. Holdings integration, copy, error states, tests, Markets budgets.

App-wide speed is not a phase here (D38).

Flags: `MARKETS_ENABLED` / `NEXT_PUBLIC_MARKETS` off in prod until phase 4 passes the mainnet smoke.

**Later (not this release):** price alerts (push), limit orders (Jupiter Trigger API), recurring buys, watchlist sync, more venues (§12), underlying-stock overlay on the chart (Pyth Pro) to show the on-chain premium/discount.

---

## 15 · Acceptance criteria

- [ ] Laptop: Markets in the sidebar after Jars, before Settings; **M** opens it.
- [ ] Phone: tab bar is Home · Holdings · + Add · Receipts · Jars; Home keeps its Next buy jars card; Markets reachable from Home (header + card) and Holdings (header + empty state); Jars button on Holdings; Activity bell on Home, Holdings, Receipts, Jars; Settings gear on Home.
- [ ] `/markets` lists all verified Solana assets with price, 24h change and sparkline; search and filters work offline from cache.
- [ ] `/markets/[assetId]` shows price, chart (6 ranges, area/candle), stats, position, recent activity; each section fails on its own.
- [ ] Buy works from Solana USDC (one signature) and from Arc (one approval sheet + swap), never debits jars, and lands in Holdings with correct cost.
- [ ] Sell by qty, %, or $ lands USDC in the Solana wallet; realised P/L recorded.
- [ ] Every row in §8 has its copy and behaviour.
- [ ] Markets budgets in §9 met; no change to `portfolio()` or `useApi` (D38).
- [ ] `pnpm check` passes; Playwright flow passes; mainnet smoke logged.
