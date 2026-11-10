# Build prompt · Markets (one go)

Paste everything below the line into a fresh coding-agent session at the repo root. It is self-contained. The spec it builds is [12-markets.md](12-markets.md).

---

You are building **Markets** for Ownback: direct buy/sell of verified xStocks on Solana via Jupiter, with a price chart, connected to Holdings, Laptop keeps a sidebar entry; phone gets 4 tabs + Add with Markets, Activity and Settings in screen headers. App-wide speed work is out of scope.

## 0 · Read first (in this order; do not skip)

1. `docs/AI_BUILD.md`: build rules (bigint Usd6 money, whole cents, never invent mints/enums/error codes/routes/env names, spec before code).
2. `docs/03-decisions-and-open-questions.md`: especially **D29, D31, D33, D34–D38**.
3. **`docs/12-markets.md`**: the full spec. It wins over this prompt if they disagree.
4. `markets-wireframes.html`: layout, states and wording for every screen.
5. Existing code you will extend (read each fully before touching it):
   - `backend/src/lib/portfolio.ts`, `jupiter-price.ts`, `jupiter-swap.ts`, `buy-pipeline.ts`, `fees.ts`
   - `backend/src/routes/jars-buys.ts` (`buildBuyReview`, `POST /buys`, swap submit), `sells.ts`, `activity.ts` (`/holdings`, `/holdings/:assetId`)
   - `backend/src/shared/{assets,errors,states,money,chains}.ts`, `backend/src/app.ts`
   - `frontend/components/ownback-app.tsx` (tabs, routing, sidebar), `frontend/components/screens/{holdings,buy}.tsx`, `frontend/components/ui.tsx`, `frontend/lib/{use-api,api,money,sign-action,arc-guard,shot-fixtures}.ts`, `frontend/app/globals.css`
   - `frontend/design-tokens.md`, `frontend/copy-and-errors.md`, `frontend/screens-and-routes.md`, `backend/api-contract.md`, `database/schema.md`

## 1 · Hard rules

- Money is `bigint` micro-USDC; JSON carries digit strings. Floats only for drawing the chart.
- Only `verifiedMint(assetId, 'solana')` assets are listed or tradable. Never add a mint.
- **No new error codes.** Use `shared/errors.ts` codes with `details.reason`.
- New enums/constants go into the spec docs first, then `backend/src/shared/`, and are imported by the frontend (mirror the existing pattern).
- Market buys set `buy_batches.trigger = 'market'` and **must not call `debitJars`** anywhere (MOCK path and swap submit). Jar buys must behave exactly as before.
- Signing: reuse `SignableAction`, `sign-action.ts`, `arc-guard.ts`. Do not loosen `arc-guard` or the server's message-hash check.
- GeckoTerminal data is display-only. Never use it in a money calculation.
- No request may wait more than 2.5 s on a third party; return cached data with `stale: true` instead.
- Don't upgrade pinned majors. New deps: latest stable, exact versions in the lockfile.
- Never commit `.env*` except `.env.example`.
- If something is ambiguous: stop, add it to "Still open" in docs/03, build the documented fallback, and say so in your summary.

## 2 · Spikes (do these first, write results into docs/12 §14)

- **S-MKT-1 GeckoTerminal:** confirm `GET https://api.geckoterminal.com/api/v2/networks/solana/tokens/{mint}/pools` and `…/networks/solana/pools/{pool}/ohlcv/{day|hour|minute}?aggregate=&limit=&currency=usd&token=base` for AAPLx (`XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp`) and 4 more xStocks; note the rate limit headers. If it fails, ship candles from `price_ticks` only (1D/1W) and show "Longer history is unavailable right now" for other ranges.
- **S-MKT-2 Jupiter batch price:** `GET https://lite-api.jup.ag/price/v3?ids=<50 comma-separated mints>`: confirm response shape for 50 ids and 429 behaviour. If batches over N fail, set the chunk size to the largest that works.

## 3 · Work in this order (each phase must leave `pnpm check` green)

### Out of scope: app-wide speed (D38)

Another session is reviewing speed. Do **not** change `portfolio()`, `/home`, `/holdings` performance, `useApi`, or add a global query library. If that work has landed a shared batched price module by the time you start, use it; otherwise create `backend/src/lib/prices/market-prices.ts` (spec §6.1) used by Markets routes only. Record anything slow you notice outside Markets in your summary instead of fixing it.

### Phase 1 · Data and jobs

1. Migration `database/migrations/0007_markets.sql` exactly as spec §10; update `database/schema.md`.
2. `backend/src/lib/prices/market-prices.ts` per spec §6.1 (or the shared module, see above).
3. Background jobs (`backend/src/jobs/markets.ts`, started from `index.ts` like the buy-pipeline ticker, behind a Postgres advisory lock): price refresh every 30 s for the hot set; tick writer every 60 s; nightly `price_ticks` cleanup (> 8 days); daily `market_pools` refresh.

### Phase 2 · Navigation and Markets list

4. Shared: `backend/src/shared/markets.ts` (`CHART_RANGES`, `MARKET_SORTS`, `US_MARKET_STATES`), `TRADE_SOURCES` in `states.ts`; `lib/market-hours.ts` (NYSE hours + 2026–2027 holidays, DST-safe) with unit tests.
5. `backend/src/routes/markets.ts`, mounted in `app.ts`, behind `MARKETS_ENABLED` (`FEATURE_OFF` when off): `GET /markets`, `GET /markets/prices`. Shapes, headers and rate limits per spec §7. Add env names to `backend/README.md § Env` and `.env.example` first.
6. Navigation per spec §4.0 (D34). In `ownback-app.tsx`, split the nav lists:
    - **Laptop sidebar:** Home · Holdings · Receipts · Jars · **Markets** (`ChartCandlestick`, key **M**) · Settings, then Activity, as today.
    - **Phone tab bar:** Home · Holdings · **+ Add** (centred) · Receipts · Jars. Settings leaves the phone tab bar. Swipe-between-tabs uses these four.
    - **Phone headers:** a shared `ScreenHeader` actions slot. Home: Markets icon button · Activity bell (unread dot from existing `/api/activity`) · Settings gear. Holdings: Jars (`PiggyBank`) · Markets · Activity. Receipts and Jars: Activity. 40×40 targets with `aria-label`s. Hidden at ≥ 900 px (sidebar covers them).
    - **Home keeps everything it has today** (Next buy jars card, waiting stack, jar brands). Only add the header icons and the Markets card.
    - **Holdings Jars entry:** header Jars button + an "In jars $X · Go to Jars →" row in the Dollars section.
    - **Home Markets card** (phone and laptop), placed after the Next buy card: eyebrow "Markets", US-market chip, top 3 movers by |24h change| among verified assets, "See all markets →". Data from `GET /markets?sort=gainers` (cached); the card fails on its own boundary and never blocks Home.
    - **Holdings empty state:** "You don't own anything yet." + primary "Browse Markets" + secondary "Go to Jars".
    - `/markets`, `/markets/[id]`, `/settings`, `/activity` render as pushed screens on phone (no tab bar, back arrow).
    - All Markets entry points hidden when `NEXT_PUBLIC_MARKETS` is not `1`; Settings and Activity entry points always shown.
7. `frontend/components/screens/markets.tsx` → `Markets` list per wireframes A1/A2 (phone) and E0 (laptop table + preview panel) and spec §4.1/§4.2: search (client-side, `/` shortcut), chips, sort, "Your assets" strip, virtualised rows (`@tanstack/react-virtual`, 64 px), SVG sparklines, visible-row price polling (IntersectionObserver, 15 s, paused when hidden), skeleton, empty, stale, offline, error states. Prefetch detail on hover / 300 ms in view.
8. Routing in `ownback-app.tsx`: `/markets` and `/markets/[assetId]` (decodeURIComponent), lazy-loaded with `next/dynamic`.

### Phase 3 · Asset page and chart

9. `GET /markets/:assetId` and `GET /markets/:assetId/candles` per §7; `backend/src/lib/prices/candles.ts` per §6.3 (GeckoTerminal client with timeout + 429 backoff, pool resolver, tick aggregation, merge, `candle_cache` with TTLs, `not_enough_history`).
10. Add `lightweight-charts` (v5). `frontend/components/markets/price-chart.tsx` (dynamic, `ssr: false`) per §6.4: area default, candle toggle, 6 ranges, crosshair callback, CSS-token colours that follow theme changes, live last-point update, reduced-motion, attribution on.
11. `MarketAsset` screen per wireframe B1/B2 and §4.2: price block, chart, position card, stats, about, recent activity, sticky dock; laptop two-column with inline trade panel. One error boundary per section (`ScreenBoundary` pattern in `states.tsx`, make a `SectionBoundary`).

### Phase 4 · Trading

12. Extract per-asset buy quoting from `buildBuyReview` into `backend/src/lib/trade/quote-buy.ts`; jar review calls it unchanged. Add the A4 reference-price check (> 2% off the market-prices reference → `PRICE_MOVED`).
13. `POST /markets/buy/review` per §7; quote payload has `source: 'market'`.
14. `POST /buys`: if quote `source === 'market'`, `trigger = 'market'`; skip `debitJars` in both paths. `BuyDone` shows market wording when `trigger === 'market'` (wireframe D1/D2). Swap failure after bridge: no jar return; copy per §8.
15. Sells: `/sells/review` accepts `qty | usd6 | pct`; `POST /sells` accepts `source`; store `cost_basis_usd6` on success; return `costBasisUsd6` / `pnlUsd6` in review.
16. `TradeSheet` component (phone sheet / laptop panel) per wireframe C1–C3 and §4.3: Buy/Sell tabs, $ keypad, chips, debounced re-quote (500 ms) + 15 s refresh ring with silent re-quote, inline errors, Slide-to-buy/sell (reuse `ConfirmAction` / `SwipeToConfirm`, `Sheet`, `Ring`, `useCountdown`, `Monogram`, `PriceTag` from `ui.tsx`), D33 approval sheet for Arc steps, headless Solana sign. Deep link `?trade=buy|sell` opens it.
17. After done: `refreshAll()` and a toast.

### Phase 5 · Holdings, copy, tests, budgets

18. Holding detail: "Buy more" / "Sell" → `/markets/[assetId]?trade=…`; `/sell/review/[assetId]` redirects there; history shows buys **and** sells tagged `From jar` / `Market`; 24h change pill on Holdings rows.
19. Copy: add a **Markets** section to `frontend/copy-and-errors.md` with every string from spec §4 and §8, then use those strings (via `lib/copy.ts`) in code. Update `frontend/screens-and-routes.md` (new rows + tab bar line), `backend/api-contract.md` (all §7 routes), `docs/04` if state lists change.
20. Shot fixtures: add markets list, asset (held / not held / chart error), trade sheet states to `lib/shot-fixtures.ts`; run `pnpm shots` at 375 and 1280, light and dark.
21. Tests per spec §13 (unit, API under `MOCK_CHAIN=1`, Playwright flow at 375 px and 1280 px including the nav entry points, perf script for the Markets budgets in §9). Must include: a market buy leaves jar totals unchanged; the phone tab bar has exactly Home, Holdings, Add, Receipts, Jars.

## 4 · Definition of done

- Every box in spec §15 ticked.
- `pnpm check` passes in `backend/` and `frontend/`.
- Markets budgets in §9 measured and written into the PR description.
- Flags default off in prod (`MARKETS_ENABLED`, `NEXT_PUBLIC_MARKETS`).
- Summary lists: spike results, anything added to docs/03 "Still open", and the mainnet smoke still to run by a human ($1 buy from Solana USDC, $1 buy needing Arc bridge, sell 50%; log in `docs/tx-log.md`). Agents don't sign mainnet transactions.
