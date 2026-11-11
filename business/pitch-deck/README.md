# Ownback pitch deck

14-slide story deck: from an iPhone receipt to "own a piece of it".

- **Live deck (view, present, export PPTX/PDF):** https://claude.ai/artifact/8dkUKzrSxgjTPLfXZR1y3a
- **Built with:** the claude.ai Slides artifact type. Each slide is one `<section>` on a 1920×1080 canvas, with speaker notes in `<aside>`.
- **Snapshot:** published version 9, 10 Nov 2026.

## Files

- `deck.json`: slide order, sections, fonts.
- `slides/<id>.html`: one file per slide, in the order below.

| # | id | Headline |
|---|---|---|
| 1 | cover | Own what you buy. |
| 2 | receipt | Yesterday, you bought an iPhone. |
| 3 | oneway | Apple got ₹79,900. You got a receipt. |
| 4 | inside | It paid six winners, not one. |
| 5 | idea | What if a slice came back to you as shares? |
| 6 | follow | Your 5% becomes $47.75, split across all six. |
| 7 | screens | One snap. One signature. |
| 8 | trust | Nothing moves until you sign. |
| 9 | stack | Three networks do the work for you. |
| 10 | live | And it already works, with real money. |
| 11 | field | Others saw it too, but stopped at the brand. |
| 12 | model | We earn only when you own. |
| 13 | next | From one wallet to 1,000 owners. |
| 14 | close | So next time you buy something, own a piece of it. |

## Images

Slides use `/_blob/<id>` URLs, which work only inside the artifact. The source files are already in the repo:

| Blob id | Source |
|---|---|
| e91d4c0f1e807631f4a34eaebf36398f | docs/screenshots/03-confirm.png |
| 28f72386e8404f060729869723f2cb75 | docs/screenshots/04-jars.png |
| d003fa831150dd10d9994e99d95e4697 | docs/screenshots/05-buy-review.png |
| c4e15d44cb4cc0250e76d3810777ee81 | docs/screenshots/06-buy-done.png |
| 9fba9c6ba6162e5d33758b576b205a44 | frontend/public/creatives/receipt.webp |
| cc959e436546a5d79b520a34e9005e26 | frontend/public/creatives/jar.webp |
| 3a2ba19f1ed5612e3c9ccce61148d106 | frontend/public/creatives/coin.webp |

## Brand and sources

- Ledger Green tokens from `frontend/design-tokens.md`. Fonts: Bricolage Grotesque, Source Sans 3, JetBrains Mono.
- Figures come from `docs/tx-log.md` (mainnet vault, $0.30 → AAPLx smoke test), `docs/01` (example split) and `business/funding-roadmap.md` (competitors, revenue, gates, ask).

## Still to fill

The close slide still has the placeholders `[OWNBACK URL]` and `[TEAM NAMES]`.
