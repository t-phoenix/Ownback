# 07 · Testing and demo

This is the app-wide plan. Each part's own tests are in:
- [contracts/contracts-testing.md](../contracts/contracts-testing.md)
- [backend/backend-testing.md](../backend/backend-testing.md)
- [frontend/frontend-testing.md](../frontend/frontend-testing.md)

## Test layers

| Layer | Tool | Runs | Money |
|---|---|---|---|
| Contract unit, fuzz and invariant | Foundry | Every commit to `contracts/` | None (Anvil) |
| Contract fork | Foundry on an Anvil fork of Arc mainnet (real USDC, real CCTP TokenMessenger) | Before deploy | None |
| Backend unit | Vitest (split rounding, FX, limits pre-check, state transitions, error mapping) | Every commit | None |
| AI eval | `pnpm eval:ai` over the 20-receipt test set ([backend/ai-spec.md](../backend/ai-spec.md#test-set)) | Every prompt change | 0G credits |
| API contract | Vitest + zod: every route's response parses against `packages/shared/api.ts`; MSW mocks are generated from the same schemas | Every commit | None |
| Frontend component | Vitest + Testing Library: each state board renders from fixtures | Every commit | None |
| End-to-end (mock chain) | Playwright on a phone viewport, with `MOCK_CHAIN=1` | Before each merge to `main` | None |
| Mainnet smoke | Scripted and manual, small amounts | At each integration checkpoint | About $1 to $5 each |

## Integration checkpoints

The parts join at these points. Each checkpoint has one command or script and a pass line.

| # | When (target) | Joins | Pass when |
|---|---|---|---|
| IC1 | Thu 23:00 | Spikes S1–S3 | $2 USDC goes Arc → Solana by CCTP and is swapped to AAPLx by hand; the tx links are saved in [08 § Spikes](08-build-plan-and-checklists.md#spikes) |
| IC2 | Fri 03:00 | Vault on Arc mainnet ↔ API | API builds `allocate`, the seed wallet signs it, and the API reads `Allocated` and marks the purchase saved |
| IC3 | Fri 05:00 | 0G pipeline ↔ API ↔ Arkiv | `POST /api/purchases` with the Croma iPhone photo returns the Confirm payload in < 6 s with 6 assets and real request IDs |
| IC4 | Fri 08:00 | Keeper end to end | User signs a BuyApproval for a $5 jar → `execute` (signature checked) → CCTP → Jupiter → AAPLx in the test user's Solana wallet → Arkiv proof → proof links open. Fees shown at review match the fees recorded after, within 20% |
| IC4b | Fri 10:00 | Auto-add | $2 USDC sent to a test user's Base address with auto-add on → added to the vault with the app closed |
| IC5 | Fri 12:00 | Circle Google sign-in ↔ wallets ↔ Gas Station | A fresh Google account signs in, gets addresses, and confirms a purchase with "$0.00" fee |
| IC6 | Fri 20:00 | PWA ↔ real API, every screen | Playwright runs on `demo` with the mock chain off, using the demo user |
| IC7 | Sat 03:00 | Full rehearsal | The stage script below runs twice in a row with no fix in between |

## Acceptance tests (R1–R16 from the PRD)

| Req | Test | Layer | Pass |
|---|---|---|---|
| R1 Sign-in | New Google account → Home; seed create and import → same addresses each time; words never leave the device (network log shows no word) | E2E + manual | Google < 30 s |
| R2 Receipt read | 5 receipts (Croma, Amazon, Nykaa, Zomato, Apple Store) | AI eval | Brand and amount correct; p50 < 6 s |
| R3 Company match | Dove → Unilever, Kurkure → PepsiCo, iPhone → Apple, Haldiram's → not listed | AI eval | All right; unknown → fallback |
| R4 Confirm + jar | Allocate moves USDC into the right jars; over-limit reverts | Foundry + IC2 | Revert reason `OverMonthlyCap` |
| R5 Buy | Signed approval → AAPLx in the user's Solana wallet; slippage ≤ 1%; `execute` without a signature reverts | IC4 + Foundry | Fill price ≤ signed max |
| R17 Fees (Q2) | Every money screen shows fees in $ and %; a route over the user's cap is blocked (user action) or waits (automatic); a mid-route spike returns the money to the jar | Unit + IC4 + forced-fee test | All pass |
| R18 Consent (Q7) | No buy happens without a signature; filling jars can be bought on request; expired or cancelled approvals can't execute | Foundry + E2E | All pass |
| R19 Per-company cap (Q1) | Purchase over the cap → the overflow shows on Confirm and goes to the fallback; a direct `allocate` over the cap reverts | Unit + Foundry | Pass |
| R6 Proof trail | All 5 links open the right explorer page | E2E link check + manual | 5/5 |
| R7 Deposit and withdraw | USDC on each of the 5 chains shows within 1 min; withdraw All returns free USDC to the user's own address | Mainnet smoke ($1 each) | 5/5 chains, 1 tap |
| R8 Privacy | DB has no image, audio or email body; Arkiv entities have no address or email; download and delete work | Script `pnpm check:privacy` | 0 hits |
| R9 Share card | X, LinkedIn, copy text, copy image, save; amounts hidden by default; no address on the card | E2E + manual on iOS and Android | All work |
| R10 Gmail | All 6 states; read-only scope asked on tap only; 30-day window; marks added and non-products | E2E (mock Gmail) + manual with a test user | 6/6 |
| R11 Dollars | No screen except the receipt line shows ₹ | E2E text scan for `₹` outside allowed elements | 0 hits |
| R12 Balance by type and chain | Home and Holdings totals match the fixture; tapping the balance opens Holdings | Component + E2E | Match |
| R13 Edge cases | Unreadable, not listed and limit reached each have a screen and lose no data | E2E | 3/3 |
| R14 Receipts and activity | Every processed invoice is listed with its status; activity shows buys, matches, reviews and limit warnings | E2E | Pass |
| R15 Price at every buy step | Review: price, quantity, max (+1%), 30 s refresh; progress/done: fill price next to the quote; Holding: each buy's price, average, price now | Component + IC4 | All shown |
| R16 Funding and buying states | All 8 FundStates and 8 BuyStates render from fixtures; the live ones (watching, seen, added; scheduled, getting prices, done) are hit on mainnet | Component + IC4 | 16/16 render |

## Mainnet money budget (about $50)

| Use | Amount |
|---|---|
| Spikes (CCTP $2, swap $2, Base route $2) | $6 |
| Deposit smoke across 5 chains ($1 each, then withdrawn) | $5, recoverable |
| IC2–IC5 tests | $10 |
| Rehearsals (2 × $5 jar) | $10 |
| Live demo (iPhone receipt → $47.75 needs a $50 limit, or use a cheaper demo receipt) | $10–$48 |
| Sponsors: Gas Station + Kora $10, relay SOL $0.10 | $10 |

Tip: for the stage, set the demo user's rate to 5% and use a cheaper real receipt (for example AirPods, ₹24,900 → $297.63 → $14.88 at 5%). Or pre-fund the Apple jar to just under $5 so a small purchase tips it to ready. "Buy now" then shows a real buy without spending $48.

## Demo script (under 3 minutes)

| Time | On screen | Say |
|---|---|---|
| 0:00 | Home, balance by type and chain | "Cashback gives you money. Ownback gives you a piece of the company." |
| 0:15 | + Add → Snap the iPhone receipt | "I bought an iPhone at Croma." |
| 0:25 | Reading: steps tick, ₹79,900 → $955.00, 0G request ID | "A private AI model on 0G reads it and converts to dollars at today's rate." |
| 0:40 | Confirm: Apple, TSMC, Qualcomm, Corning, gold, silver, with sources | "It finds who made it and who's behind it. Every supplier comes with a quote from a public filing, stored on Arkiv." |
| 1:00 | Confirm $47.75 → Circle approval → Saved | "One tap. The money goes into jars in my vault on Arc. Gas is paid for me." |
| 1:15 | Jars → Buy → Review (venue, live price, max +1%, fees $0.05 · 0.1% of 5% limit) → sign | "Nothing buys without my OK. I see the price, the venue and the fees, and they're capped." |
| 1:35 | Buying: Arc → CCTP → Jupiter → done | "Circle moves the dollars to Solana and Jupiter buys AAPLx into my own wallet." |
| 2:00 | Holding → proof trail → open Solscan and the Arkiv record | "Every step is public: the AI run, the Arc transaction, the bridge, the buy, and an anonymous record on Arkiv." |
| 2:20 | Share card → Post to X | "And I can show it off without showing amounts." |
| 2:35 | Arc Studio project (required for the Arc prize) | "The vault was built and tested in Arc Studio." |
| 2:45 | Close | "Stop being only a customer. Own what you buy." |

**Backup:** record the full run at IC7 (720p+, real voice). If the network fails on stage, play the recording and show the live Holding page and explorers.
