# Design tokens

**Picked by the user on 6 Nov:**
- Logo C · Slice
- Palette 2 · Ledger Green
- Type II · Bricolage Grotesque + Source Sans 3 + JetBrains Mono

Brand kit: https://claude.ai/artifact/2Uqk914XAsxD7aAconWDqo. A local copy is at [ownback-brand-kit.html](../ownback-brand-kit.html).

All values live in `app/tokens.css` as CSS variables. Tailwind reads the variables.

## Colour roles

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ink` | `#0E2A1F` | `#F6F8F5` | Text |
| `--primary` | `#0F7B4F` | `#4CC38A` | Buttons, links, the maker segment |
| `--accent` | `#E9B949` | `#E9B949` | The "piece": jar fill, the lifted slice in the logo, the behind segment. **Fill only, never text on white** (1.8:1) |
| `--paper` | `#F6F8F5` | `#0E2A1F` | Page background |
| `--surface` | `#FFFFFF` | `#14352A` | Cards |
| `--soft` | `#CFEBDD` | `#1D4536` | Tints, chips, selected rows |
| `--on-primary` | `#FFFFFF` | `#0E2A1F` | Text on primary |
| `--on-accent` | `#0E2A1F` | `#0E2A1F` | Text on accent (8.4:1) |
| `--muted` | `#5D6B63` | `#9FB3A8` | Secondary text |
| `--line` | `#E2E8E4` | `#24493B` | Dividers |
| `--good` | `#0F7B4F` | `#4CC38A` | Success ticks (same as primary) |
| `--warn` | `#9A6B00` | `#E9B949` | Slow, near limit, fees close to the cap |
| `--bad` | `#B4342B` | `#FF7A6E` | Failed (calm copy, use sparingly) |

**Contrast, checked 6 Nov (WCAG AA ≥ 4.5 for text):**

| Pair | Ratio |
|---|---|
| ink on paper | 14.4 |
| white on primary | 5.3 |
| primary on paper | 5.0 |
| muted on paper | 5.3 |
| warn on white | 4.7 |
| bad on white | 6.1 |
| ink on accent | 8.4 |
| paper on ink (dark) | 14.4 |
| dark primary `#4CC38A` on ink | 6.9 |
| dark muted on ink | 6.9 |
| accent on ink | 8.4 |

The dark surface, soft and line values are new. Check them with a contrast tool once they're built.

**Split bar:**
- maker = `--primary`
- behind the product = `--accent`
- raw materials = `#8FB9A3` (a light green, so it's distinct from both). Add the text labels for colour-blind users.

## Type

| Token | Font | Weights | Use |
|---|---|---|---|
| `--font-display` | Bricolage Grotesque | 700, 800 | Big dollar amounts, screen titles |
| `--font-body` | Source Sans 3 | 400, 600 | Everything else |
| `--font-mono` | JetBrains Mono | 400, 500 | Addresses, tx hashes, request IDs, price tables |

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
