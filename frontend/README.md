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

Run it: `pnpm dev` starts with mocks (`NEXT_PUBLIC_MOCKS=1`); `pnpm dev:real` points at the real API.
