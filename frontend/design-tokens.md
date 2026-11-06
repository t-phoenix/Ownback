# Design tokens

**Picked by the user on 6 Nov:**
- Logo C · Slice
- Palette 2 · Ledger Green
- Type II · Bricolage Grotesque + Source Sans 3 + JetBrains Mono

Brand kit: https://claude.ai/artifact/2Uqk914XAsxD7aAconWDqo. A local copy is at [ownback-brand-kit.html](../ownback-brand-kit.html).

All values live in `app/globals.css` as CSS variables (light on `:root`, dark under `prefers-color-scheme` unless the user picked light, and under `:root[data-theme="dark"]`). The user can pick System / Light / Dark in Settings.

**Rule:** every text colour is paired with the surface it sits on. Components never hard-code a colour. The only exceptions are the always-dark "vault" surfaces (balance card, capture card, share card, sign-in art), which carry their own `--on-vault*` tokens, and the QR code (always dark on white).

## Colour roles

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ink` | `#0E2A1F` | `#F2F6F3` | Text |
| `--ink-2` | `#29443A` | `#D3E0D8` | Strong secondary text |
| `--muted` | `#56665D` | `#A3B8AC` | Secondary text |
| `--primary` | `#0F7B4F` | `#4CC38A` | Buttons, the maker segment, focus ring |
| `--primary-text` | `#0F7B4F` | `#6FD6A2` | Links and eyebrows on paper/surface |
| `--on-primary` | `#FFFFFF` | `#0B2219` | Text on primary |
| `--accent` | `#E9B949` | `#E9B949` | The "piece": jar fill, the lifted slice, the behind segment. **Fill only, never text on light** (1.8:1) |
| `--accent-soft` / `--accent-ink` | `#FBF2D6` / `#7A5300` | `#3A3218` / `#F2D27A` | Reminder and "filling" tints, with their text colour |
| `--on-accent` | `#0E2A1F` | `#0E2A1F` | Text on accent (8.4:1) |
| `--paper` / `--paper-2` | `#F6F8F5` / `#EDF2EE` | `#0B2219` / `#0E281E` | Page background / sunken areas (sidebar, tracks) |
| `--surface` | `#FFFFFF` | `#13332A` | Cards |
| `--soft` / `--on-soft` | `#DDF0E5` / `#0A5A39` | `#1D4536` / `#A6E8C6` | Tints, secondary buttons, chips, with their text colour |
| `--line` / `--line-strong` | `#E1E8E3` / `#C9D5CD` | `#234A3B` / `#2F5C4A` | Dividers / control borders |
| `--good` | `#0F7B4F` | `#6FD6A2` | Success ticks |
| `--warn` | `#8A5F00` | `#F2C55C` | Slow, near limit, needs review |
| `--bad` | `#B4342B` | `#FF8A7E` | Failed (calm copy, use sparingly) |
| `--vault` / `--on-vault` / `--on-vault-muted` | `#0F2A1E` / `#F6F8F5` / `#A7C2B4` | `#071A12` / same / same | Always-dark hero surfaces |

Monogram tiles (`.tone-green|mint|gold|clay|sage|silver|sky`) each define a background/foreground pair for both themes, all ≥ 6.6:1.

**Contrast, re-checked 7 Nov against the built CSS (WCAG AA ≥ 4.5 for text). All pairs pass; the lowest are listed:**

| Pair | Light | Dark |
|---|---|---|
| ink on paper | 14.4 | 15.3 |
| muted on paper / surface | 5.7 / 6.1 | 8.0 / 6.5 |
| primary-text on paper-2 (worst case) | 4.7 | 8.8 |
| on-primary on primary | 5.3 | 7.5 |
| on-soft on soft | 7.0 | 7.7 |
| accent-ink on accent-soft | 6.1 | 8.7 |
| warn on surface | 5.7 | 8.4 |
| on-vault-muted on vault | 8.0 | 9.5 |

Fixed in this pass (text was disappearing in dark mode): active chips, the share card, toasts, the Gmail card, "Next buy" card and monogram avatars all used fixed light backgrounds or `--ink` as a background, so they turned into light text on light colours.

**Split bar:**
- maker = `--primary`
- behind the product = `--accent`
- raw materials = `#8FB9A3` (a light green, so it's distinct from both). Add the text labels for colour-blind users.

## Type

| Token | Font | Weights | Use |
|---|---|---|---|
| `--font-display` | Bricolage Grotesque | 700, 800 | Big dollar amounts, screen titles |
| `--font-body` | Source Sans 3 | 400, 600 | Everything else |
| `--font-mono` | JetBrains Mono → `ui-monospace` / SF Mono fallback | 400, 500 | Addresses, tx hashes, request IDs, price tables. Not self-hosted yet: `@fontsource/jetbrains-mono` install was blocked by pnpm's minimum-release-age policy on 7 Nov |

Self-host through `next/font/google` (no runtime Google request, CSP stays `'self'`).

| Size token | px / line height | Use |
|---|---|---|
| `--t-hero` | 40 / 44 | Total balance |
| `--t-title` | 24 / 30 | Screen title |
| `--t-h` | 17 / 22 | Card titles |
| `--t-body` | 16 / 24 | Body (Source Sans reads small, so use 16) |
| `--t-small` | 13 / 18 | Captions, footers |
| `--t-micro` | 11 / 14 | Section labels (uppercase, letter-spacing 0.06em) |

## Space, shape, motion

- Spacing: `--s-1: 4px` · `--s-2: 8px` · `--s-3: 12px` · `--s-4: 16px` (page gutter) · `--s-5: 24px` · `--s-6: 32px`
- Radii: `--r-card: 16px` · `--r-btn: 999px` · `--r-chip: 999px` · `--r-input: 12px`
- Shadow: `--shadow-card: 0 1px 2px rgba(14,42,31,.06), 0 4px 16px rgba(14,42,31,.06)`
- Motion: `--motion: 160ms cubic-bezier(.2,.8,.2,1)`, off under `prefers-reduced-motion`

## Logo C · Slice

A coin with a quarter lifted out. It works at 16 px and doubles as the "o" in the wordmark.

```svg
<svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <path d="M32 8a24 24 0 1 0 24 24H32z" fill="currentColor"/>
  <path d="M37 3a24 24 0 0 1 24 24H37z" fill="var(--accent)"/>
</svg>
```

- Coin = `--primary` (or `--ink` on soft backgrounds); slice = `--accent`.
- `public/logo.svg`; app icons at 192 and 512, maskable with a 20% safe zone; favicon at 32 px.
- Wordmark: "Ownback" in Bricolage 800, with the Slice mark replacing the first "o" only in large lockups. Keep the plain text "Ownback" in the UI.

## Tailwind

```js
theme: { extend: {
  colors: { ink: 'var(--ink)', primary: 'var(--primary)', accent: 'var(--accent)', paper: 'var(--paper)', surface: 'var(--surface)',
            soft: 'var(--soft)', muted: 'var(--muted)', line: 'var(--line)', good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)' },
  fontFamily: { display: 'var(--font-display)', body: 'var(--font-body)', mono: 'var(--font-mono)' },
  borderRadius: { card: '16px' },
}}
```

Icons: Lucide, 20 px, stroke 1.75. Show company names as text, never as their logos.

## Layout, gestures and return habits (7 Nov)

**Layout.** Below 900 px: one column, a floating tab bar inside the thumb arc, and the raised **Add** in the centre. Primary actions sit at the bottom of each flow (the "dock"). From 900 px: a sticky sidebar (logo → "Add a purchase" → nav → this week's buy-day card), which is the first stroke of the F-pattern. Home becomes two columns from 1100 px: the vault, the waiting stack and brands on the left; the ritual, the next buy and receipts on the right.

**Gestures (phone).**
- Swipe sideways between tabs; pull down on a tab to refresh ("Updated just now").
- The "Waiting for you" stack: swipe right to act, left for later. Buttons do the same.
- Slide to confirm the two irreversible moments (Confirm purchase, Buy now). A tap only nudges the knob. Enter/Space confirm from a keyboard. A mouse gets a normal button.
- Long-press a jar (or right-click it) for its sheet. Drag a sheet's handle down to close it.
- A light haptic tick on key moments where the platform supports it.

**Desktop.** Single-key shortcuts H, O, A, R, S, J, N (the hints show on hover in the sidebar). Drop a receipt anywhere, or paste a screenshot with ⌘V; both open Reading.

**Why people come back** (no streak punishment, no fake urgency):
- *Open loops:* "Waiting for you" lists only real pending items (jars ready, receipts to review, Gmail invoices).
- *A weekly ritual:* "Buy day is Sunday", with a 7-day strip of the days a receipt was added. It matches the Sunday reminder push.
- *Goal gradient:* glass jars fill toward $5 and show "$1.82 to go".
- *Collection:* "Brands you buy, owned" turns each shop into a company you own a piece of, with "of $955.00 spent · 6.5%".
- *Peak-end:* Saved and Buy done end on a moment (gold slices falling into a jar, a coin burst), then the share card.

**3D creatives** live in `public/creatives/` (coin, jar, receipt, shelf; WebP, 10–28 kB each). They are rendered on brand ink-green, so use them only on vault surfaces; `.creative` feathers their edges. `<Coin3D>` is the live, layered CSS version of the Slice mark, used where it needs to move (Rules, Buy done). All motion stops under `prefers-reduced-motion`.
