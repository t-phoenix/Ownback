# Frontend

A mobile-first PWA built with Next.js App Router in `apps/web`. It is designed for a 390 × 844 phone, matching the wireframes. Every screen is built against mocks generated from the shared API schemas, so frontend work never waits on the backend.

| Doc | What it's for |
|---|---|
| [screens-and-routes.md](screens-and-routes.md) | Every one of the 36 wireframe boards → route, data, states, links |
| [frontend-architecture.md](frontend-architecture.md) | Stack, data fetching and polling, signing (Privy + seed), PWA/offline, money formatting |
| [copy-and-errors.md](copy-and-errors.md) | Every user-facing message, keyed by state and error code; banned words. **Freezes Fri 12:00** |
| [design-tokens.md](design-tokens.md) | Colours, type, spacing (Logo C · Ledger Green · Bricolage; Q6 done) |
| [frontend-security.md](frontend-security.md) | Seed phrase handling, CSP, XSS, what never goes in the bundle |
| [frontend-testing.md](frontend-testing.md) | Component tests per state, Playwright flows, device checks |

## Stack

| Need | Choice |
|---|---|
| Framework | Next.js (App Router), React, TypeScript strict |
| Styling | Tailwind with the tokens from [design-tokens.md](design-tokens.md) |
| Server state | TanStack Query (polling, retries, stale times) |
| Forms / validation | zod schemas from `packages/shared/api.ts` |
| Mocks | MSW (handlers + fixtures from the wireframe numbers) |
| Google sign-in + approvals | Privy (`@privy-io/react-auth`) — smart wallet + Solana (Q9) |
| Seed path | `@scure/bip39`, `@scure/bip32`, `viem` (EVM), `@solana/web3.js` + `ed25519-hd-key` (Solana) |
| QR | `qrcode` (Fund screen) |
| PWA | `next-pwa`-style service worker: app shell cache, Web Push, offline photo queue |
| Share | `navigator.share` with files, `navigator.clipboard.write` (PNG), X/LinkedIn intent URLs |

Run it (7 Nov, no client-side mocks any more; every screen reads the API):

1. Start the API: `cd backend && npm run dev` (port 3001).
2. Create `frontend/.env.local` with `NEXT_PUBLIC_PRIVY_APP_ID` (the Privy app ID, public) and `NEXT_PUBLIC_API_URL` (where `/api/*` is proxied; defaults to `http://127.0.0.1:3001/api`).
3. `pnpm dev`, or `pnpm build && pnpm start` (the Privy bundle makes the first dev compile slow).

The browser only ever calls same-origin `/api/*`; `next.config.ts` rewrites it to `NEXT_PUBLIC_API_URL`, so the Lax session cookie works on Vercel without cross-site cookies. Data hooks live in `lib/use-api.ts` (cached per screen, refetch on focus and on pull-to-refresh); the typed client is `lib/api.ts`; Privy and the API session are in `components/session.tsx`.

Installs use pnpm 11. `pnpm-workspace.yaml` pins `caniuse-lite` one release back to satisfy the 1-day minimum release age, and lists the native add-ons whose build scripts we skip.
