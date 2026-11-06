# Frontend tests

## Component tests (Vitest + Testing Library)

Each state board becomes a test file that renders the screen from a fixture for every state. They give fast feedback without a browser.

| Board | States to render |
|---|---|
| FundStates | 8 (watching, seen, added, below min, not USDC, unsupported, slow, can't check) + needs approval (Q3) |
| GmailStates | 6 |
| ConfirmStates | 6 |
| BuyStates | 8 + no venue |
| GlobalStates | 7 |
| Home / Holdings | Totals match the fixture; chain chips sum to the total; tapping the balance goes to `/holdings` |
| Confirm | Rows sum to the invest amount; unticking a row re-splits; "Only Apple" |
| Money | `formatUsd`, `formatLocal` (₹79,900; ₹1,14,900), `formatQty` (0.1128, 0.01626) |
| Fees | Every money screen renders fees in $ and %; over-cap rows are unselected with the reason |
| verifyAction | A tampered `SignableAction` (different asset or amount) is refused |

## End-to-end (Playwright, 390×844, Chromium + WebKit)

On mocks (`NEXT_PUBLIC_MOCKS=1`) on every PR, and against `demo` at IC6.

| Flow | Steps |
|---|---|
| Onboarding (seed) | Create → reveal → tick → PIN → rules 5% → Add funds → skip → Home first time |
| Onboarding (shared link) | `/r/ABHI42` → Start → sign in → the referral is stored |
| Purchase (photo) | Add → upload the Croma fixture → Reading ticks → Confirm shows 6 rows totalling $47.75 → Confirm → Saved |
| Purchase edge cases | Not listed → S&P 500; Limit → save $5.00; Couldn't read → type it |
| Gmail | Card state 2 → allow (mock OAuth) → scanning → found 3 → list → match 3 |
| Buy | Jars → Buy now → Review (countdown) → price moved → Wait / Buy at the new price → progress → done → Holding |
| Holding | Proof links have the right explorer hosts; share buttons call the right URLs; Hide amounts on by default |
| Withdraw | 50% → Base → sending → sent |
| Offline | Go offline on Home → bar shows; queue a photo; back online → it sends |
| Session expiry | 401 on Holdings → sign in → back on Holdings |
| Dollars only | Text scan of every screen: `₹` appears only on receipt lines and the Gmail list (R11) |

## Device checks (manual, before IC7)

| ✓ | Check |
|---|---|
| ☐ | iPhone Safari: added to the home screen, push arrives, camera capture, share sheet with the image |
| ☐ | Android Chrome: install prompt, push, camera, share sheet, copy image |
| ☐ | Circle Google sign-in on both phones with a non-team account (S7) |
| ☐ | Slow 3G throttle: skeletons appear, never a blank screen |
| ☐ | Dark mode readable |
| ☐ | VoiceOver / TalkBack read the balance, the split bar and the buttons |
