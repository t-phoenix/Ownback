# Frontend architecture

## Folders (`apps/web`)

```
app/(tabs)/page.tsx, holdings/, add/, receipts/, settings/     tab screens (shared layout with the tab bar)
app/(flow)/signin/, onboarding/, funds/, add/[id]/…, buy/, jars/, activity/   full-screen flows with a back arrow
app/r/[code]/page.tsx                                          public landing
components/ui/            Button, Card, Row, Chip, Sheet, Skeleton, Toast, Money, Bar (70/20/10), StepList, Countdown
components/states/        OfflineBar, ErrorBlock, EmptyBlock, StalePrices (GlobalStates)
lib/api.ts                typed fetch wrapper (zod parse on every response, maps errors → ErrorCode)
lib/sign/                 signAction(action: SignableAction) → { txHash | challengeId }
lib/seed/                 create/import, derive, encrypt (WebCrypto), sign
lib/circle.ts             Web SDK init, login, execute(challengeId)
lib/money.ts              re-export of packages/shared/money (formatUsd, formatLocal, formatQty, formatPrice)
mocks/                    MSW handlers + fixtures (wireframe numbers, corrected per docs/03)
```

## Data fetching

TanStack Query, one hook per API route (`useHome`, `useHoldings`, `usePurchase(id)`…). The keys and intervals live in one file:

| Query | Stale time | Refetch | Notes |
|---|---|---|---|
| home, holdings, wallet | 30 s | Every 60 s while visible; invalidated after a deposit, confirm, buy or withdraw | Pull-to-refresh calls `refetch` and shows the small spinner |
| deposits/watch | 0 | 5 s → 30 s when `slow` | Stops at `added` |
| purchase(id) while reading | 0 | 700 ms | Stops when the status leaves `reading` |
| buys/review | 0 | 30 s, with a visible countdown | Each new quote replaces `quoteId` |
| buys/:batchId | 0 | 2 s | Stops at `done*`/`failed` |
| receipts, activity | 60 s | On focus | Infinite queries |
| gmail/state | 10 s | 2 s while `scanning` | |

Rules:
- Never hide numbers while refetching.
- If prices are older than 5 min, show "Prices from 10:41 · refreshing".

## Signing (one entry point)

```ts
async function signAction(a: SignableAction): Promise<{ txHash?: string; challengeIds?: string[]; signature?: string }> {
  switch (a.kind) {
    case 'circle_challenge': for (const id of a.challengeIds) await circle.execute(id); return { challengeIds: a.challengeIds };   // Circle's sheet, once per step, in order
    case 'evm_calls':        return { txHash: await seed.sendCalls(a.chain, a.calls) };                // in order; waits for each
    case 'sol_tx':           return { txHash: await seed.signAndSendSol(a.txBase64, a.feePayer) };
    case 'typed_data':       return { signature: await (isGoogle ? circle.signTypedData(a) : seed.signTypedData(a.typedData)) };
  }
}
```

**Before any signature (A5):** `verifyAction(a)` decodes the calldata or typed data with the shared ABI and checks it against `a.expect` (assets and amounts) and the screen the user is looking at. On any mismatch it refuses and shows "Something doesn't match. Nothing was sent." Fees from `a.fees` are always rendered next to the button.

After it returns, call the matching `…/submitted` route. Then poll until the server reports the final state. Never mark something "saved" or "sent" on the client alone.

- **Circle:** if the `userToken` has expired (`CHALLENGE_FAILED` with an auth reason), re-run the Google login silently and retry once.
- **Seed:**
  - The words are encrypted in IndexedDB with a key from the app PIN.
  - They're decrypted only inside `signAction` and dropped right after.
  - Arc gas is paid in USDC from the same wallet. EVM chains use Paymaster; Solana uses Kora ([docs/05](../docs/05-gasless-and-fees.md)).

## Money and numbers

- All amounts arrive as `Usd6` strings → `formatUsd` → `$47.75`. Thousands get commas: `$9,210`.
- No floats in maths. Sums use `bigint`.
- Local money only appears on the receipt line, as `₹79,900 → $955.00`, and in the Gmail list. It uses Indian digit grouping for INR.
- Quantity: up to 4 significant decimals (`0.1128 AAPLx`, `0.01626`). Prices: `$296.31 per AAPLx`.
- Percentages: integers (`5%`, `70%`).

## PWA and offline

- Manifest: name "Ownback", standalone display, theme colour from the tokens, 192/512 icons (Logo C · Slice).
- Service worker:
  - Caches the app shell and the last API responses for Home, Holdings and Receipts (for "showing what we had at 10:41").
  - Stores Web Push subscriptions.
  - Queues receipt photos in IndexedDB while offline and sends them when back online. Only photos are queued, never money actions.
- Offline bar: driven by `navigator.onLine` plus failed fetches.
- iOS: push needs the PWA added to the home screen. Show a one-time tip after the first purchase.

## Navigation rules

- Back arrows follow the wireframe link targets, for example Confirm ‹ → Reading.
- Disable back while `saving`, so a purchase can't be confirmed twice.
- After `UNAUTHENTICATED`, store the path, go to `/signin`, and return to that path afterwards (GlobalStates 6).
- Deep links from push notifications use each event's `link`.

## Share

| Button | Does |
|---|---|
| Post to X | `https://x.com/intent/post?text=…&url=https://<app>/r/<code>` |
| Post to LinkedIn | Copy the text first (toast "Text copied, paste it in"), then `https://www.linkedin.com/sharing/share-offsite/?url=…` |
| Copy text | `navigator.clipboard.writeText` |
| Copy image | `fetch('/card/<id>.png')` → `ClipboardItem({'image/png': blob})`; if unsupported → Save image |
| More | `navigator.share({ files: [png], text, url })` on phones |

"Hide amounts" is on by default. The card URL only gets `?amounts=1` when it's off. The card never shows a wallet address.

## Accessibility

- Tap targets ≥ 44 px.
- Contrast AA (the tokens are checked).
- Every icon button has a label.
- The 70/20/10 bar has a text equivalent.
- Countdowns use `aria-live="polite"`.
- Respect reduced motion: no spinner animation.
