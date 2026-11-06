# Screens and routes

There is one row per wireframe board, all 36. Wireframes match [docs/03](../docs/03-decisions-and-open-questions.md) as of 6 Nov evening (ready minimum, fees everywhere, Q3 deposits, signed buys only). When building a screen, open it in [ownback-wireframes.html](../ownback-wireframes.html#Home) next to this table (each screen has an anchor, e.g. `#Confirm`). State boards (in *italics*) aren't routes; they list the states the named route must render.

Tab bar (on Home, Holdings, + Add, Receipts, Settings): **Home `/` · Holdings `/holdings` · + Add `/add` · Receipts `/receipts` · Settings `/settings`**.

## A · Onboarding

| Board | Route | Data (API) | Links / actions | States |
|---|---|---|---|---|
| Shared link (web) | `/r/[code]` (public, SSR, OG tags) | Server: owner's display name, card image, company count | "Start owning what you buy" → `/signin` (sets `ob_ref`) | Unknown code → plain landing with no inviter |
| Sign in | `/signin` | `POST /api/auth/privy` | "Continue with Google" → Privy (smart wallet + Solana) → session → `/onboarding/rules`; "Use a seed phrase" → `/signin/seed`; Terms · Risks links | Loading on the button; `AUTH_INVALID`; `GEO_BLOCKED` |
| Seed phrase | `/signin/seed` | `GET /api/auth/seed/nonce`, `POST /api/auth/seed` | Tabs Create new / Import mine; "Tap to reveal"; checkbox "I wrote them down"; Continue → set PIN → `/onboarding/rules` | Invalid words; wrong word count; PIN mismatch |
| Set your rules | `/onboarding/rules` | `GET/PUT /api/rules` | Slider 2–10% with live example "$955 iPhone → $47.75 into Apple"; monthly limit; Max fees 5%; Ready when $5 (reminder threshold); fallback chips; "Add $20 to start" → `/funds` | Saving |
| Home, first time | `/` when the user has no receipts | `GET /api/home` | Balance card → `/holdings`; "Add a purchase" → `/add` | — |

## A2 · Add funds

| Board | Route | Data | Links / actions | States |
|---|---|---|---|---|
| Add funds · watching | `/funds` | `GET /api/deposits/address?chain=`, poll `GET /api/deposits/watch` every 5 s | Send USDC / Card or UPI (disabled, "Coming soon"); chain chips **Arc (default)** · Solana · Base · Ethereum · Arbitrum; QR + Copy address; on EVM chains an "Auto-add from {chain}" row → `POST /api/deposits/auto-add` (one approval, Q3); pull-to-refresh; "Skip for now" → `/` | FundStates 1, 4–8 |
| Deposit on its way | `/funds/[depositId]` | poll `GET /api/deposits/watch` | Step list seen → confirmed → added → ready; "View on Basescan"; approval sheet when `needs_approval` (Q3) | FundStates 2, 7 |
| Funds added | `/funds/[depositId]` when `added` | same | "Add your first purchase" → `/add`; "Go home" → `/` | FundStates 3 |
| *Add funds: every state* | — | — | — | 8 states; copy in [copy-and-errors.md](copy-and-errors.md#add-funds) |

## B · Dashboard

| Board | Route | Data | Links | States |
|---|---|---|---|---|
| Home | `/` | `GET /api/home` (refetch 60 s, and after any deposit, confirm or buy) | Bell → `/activity`; balance → `/holdings`; top holding → `/holdings/[assetId]`; USDC row → `/settings/wallet`; "See all 11" → `/holdings`; receipt row → `/receipts/[id]`; "All" → `/receipts`; Next buy → `/jars` | GlobalStates 1–5 |
| Holdings | `/holdings?type=&chain=` | `GET /api/holdings` | Wallet → `/settings/wallet`; USDC free → `/settings/wallet`; USDC in jars → `/jars`; any row → `/holdings/[assetId]` | Empty: crypto section text; GlobalStates |
| Holding | `/holdings/[assetId]` | `GET /api/holdings/:assetId` | Each buy → `/buy/[batchId]`; share buttons; "Hide amounts" toggle (default on); proof steps open explorers in a new tab; "Open in wallet" (Phantom deep link) | Proof step "pending" while the Arkiv write is queued |
| Activity | `/activity` | `GET /api/activity` | Each item's `link` (buy done → `/buy/[batchId]`, matched → `/receipts/[id]`, needs review → `/receipts/[id]`, jar ready → `/jars`, fallback → `/receipts/[id]`, limit → `/settings`) | Empty |
| *App-wide states* | all tabs | — | — | 7 states ([docs/04 §10](../docs/04-state-machines.md#10--app-wide-ui-only-globalstates)) |

## C · Add a purchase

| Board | Route | Data | Links / actions | States |
|---|---|---|---|---|
| Add a purchase | `/add` | `GET /api/gmail/state` | Gmail card (see GmailStates) → `/add/gmail`; Snap/upload → camera/file → `POST /api/purchases` → `/add/[id]/reading`; Say it → record → same; Type it → `/add/type` (the Fix the match form, D14) | Offline: the photo queues |
| *Gmail card: every state* | top card on `/add` | `GET /api/gmail/state`, `POST /api/gmail/connect`, `POST /api/gmail/scan` | Connect Gmail / Allow read access → OAuth; Review N invoices → `/add/gmail`; Check now; Reconnect | 6 states |
| Invoices in Gmail | `/add/gmail` | `GET /api/gmail/invoices` | Filter chips New / Already added / Not a product; select rows; footer totals (Selected, Your 5%, Rate); "Match 3 invoices" → `POST /api/gmail/invoices/match` → first purchase's reading, then the next | Added and non-product rows not selectable |
| Reading | `/add/[id]/reading` | poll `GET /api/purchases/:id` every 700 ms | Auto-advance: `ready` → `/add/[id]`; `not_listed` → `/add/[id]/not-listed`; `read_failed` → `/add/error` | Steps tick in order; request ID shown when known |
| Confirm | `/add/[id]` | `GET /api/purchases/:id`; `PUT …/assets` (tick boxes). Shows Apple $33.43 etc. as matched (no per-company overflow) and the fee line ("Network fee $0.00 · we cover it") | Edit split → `/add/[id]/split`; "Confirm $47.75 across 6" → `POST …/confirm` → sign → `POST …/confirm/submitted` → `/add/[id]/saved`; "Only Apple" → `PUT …/split {makerOnly}`; "Wrong product? Fix it" → `/add/[id]/fix`; "Why these companies?" expands sources + request ID | ConfirmStates |
| *Confirm: every state* | on `/add/[id]` | — | Not enough → "Add $12.35" → `/funds` or "Save $35.40" → confirm with `amountUsd6`; Over limit → `/add/[id]/limit` | 6 states |
| Edit split | `/add/[id]/split` | `PUT /api/purchases/:id/split` | 3 sliders summing to 100; presets 70/20/10 · Maker only · 50/30/20; "Use for all future purchases" → also `PUT /api/rules`; Save → back | Sum ≠ 100 disables Save |
| Fix the match | `/add/[id]/fix`, `/add/type` | `GET /api/makers/search?q=`, `PUT …/match` or `POST /api/purchases` (typed) | Pick a row → back to Confirm; "It's a private or local brand" → `/add/[id]/not-listed` | Search empty |
| Brand not listed | `/add/[id]/not-listed` | `PUT …/fallback` | Info note about suppliers (not an option); choose fallback or skip; "Put $0.13 into S&P 500" → confirm flow → saved; "Wrong brand? Fix it" → fix | Skip → `/` with a toast |
| Limit reached | `/add/[id]/limit` | from `LIMIT_REACHED` details | "Save $5.00 now, rest next month" → confirm with `amountUsd6` → saved; "Raise limit to $100" → `/settings` (limit sheet); "Skip this purchase" → `/` | — |
| Couldn't read | `/add/error` | — | Retake → `/add` (camera); Type it instead → `/add/type` | — |
| Saved | `/add/[id]/saved` | `GET /api/purchases/:id` | "Add another purchase" → `/add`; "Go home" → `/` | Copy changes if `restPendingUsd6 > 0` |

## D · Buying

| Board | Route | Data | Links | States |
|---|---|---|---|---|
| Jars | `/jars` | `GET /api/jars` | Ready jars: "Tap to buy" (Q7); filling jars: "Buy now anyway" → `/buy/review?include=all` with the fee preview; "Review and buy" → `/buy/review`; cancel a jar (long-press menu) → signable | Ready waiting for you, fees_high, paused, `no_venue` |
| Buy review | `/buy/review` | `GET /api/buys/review` (refetch every 30 s, countdown) | Each row: venue, price now, reference check, qty, max price (+1%), **fees in $ and %**; footer: total, fees vs "your limit 5%". "Buy now · $43.63" → sign the BuyApproval (typed data) → `POST /api/buys` → `/buy/[batchId]`. Rows over the fee cap are unselected with "Fees too high (9.4%)" | BuyStates 2, 3, 8, fees_high |
| Buying | `/buy/[batchId]` | poll `GET /api/buys/:batchId` every 2 s | Leave any time; when done → same route shows Done | BuyStates 4–7 |
| Buy done | `/buy/[batchId]` when `done*` | same | Rows → `/holdings/[assetId]`; "Share what I own" → `/holdings/[first]#share` | `done_partial` shows "still filling" + returned rows |
| *Buying: every state* | on the routes above | — | — | 8 states |

## E · Receipts

| Board | Route | Data | Links | States |
|---|---|---|---|---|
| Receipts | `/receipts?filter=` | `GET /api/receipts` (infinite) | Rows → `/receipts/[id]`; "See 18 more" loads the next page | Empty; filter Needs review shows a count |
| Receipt detail | `/receipts/[id]` | `GET /api/receipts/:id` | "Where it went" rows → `/holdings/[assetId]`; proof links; "Report wrong match" → `/add/[id]/fix`; "Delete receipt data" → confirm sheet → `DELETE` | Deleted: fields replaced by "Deleted by you" |

## F · Settings

| Board | Route | Data | Links | States |
|---|---|---|---|---|
| Settings | `/settings` | `GET /api/me`, `GET /api/rules`, `GET /api/gmail/state` | "Max fees 5% of each buy" → sheet (0.5–10%); "Ready when $5" → sheet; "Auto-add from Base / Ethereum / Arbitrum" → toggles + allowance. Rate → sheet; Split → `/settings/split`; monthly limit, fallback, buy day → sheets; Wallets → `/settings/wallet`; Add funds → `/funds`; Gmail → Gmail card states; 0G account (flag); notification toggles → `PUT /api/notifications`; Download my data → `GET /api/me/export`; Delete all receipt data → confirm → `DELETE /api/receipts`; How it works, Risks → static pages; Invite → share `/r/[code]`; Sign out → `POST /api/auth/logout` → `/signin` | — |
| Wallets and sign-in | `/settings/wallet` | `GET /api/wallet` | Add funds → `/funds`; Withdraw → `/settings/wallet/withdraw`; Copy addresses; Open in a Solana wallet; seed users see only "Reveal seed phrase" (PIN) under sign-in; backup sign-in "Coming soon" | — |
| Withdraw | `/settings/wallet/withdraw` | `POST /api/withdraw`, poll `GET /api/withdraw/:id` | 25% / 50% / All; chain chips; "Withdraw $35.40" → sign → "Sent $35.40 to your wallet on Base" → `/settings/wallet` | approve → sending → sent; failed |

## Static pages (linked from Sign in and Settings)

`/terms`, `/risks` (token issuers, no advice, not for US persons), and `/how-it-works`. These need copy, not design, so use plain text pages.
