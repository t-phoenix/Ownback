# Registry seed data

The MVP doesn't read filings live. We precompute about 10 products and import them to Arkiv ([arkiv-schema.md](arkiv-schema.md), SDK 1.0.1 schemas, 180-day lifetimes refreshed weekly). The data files live in `database/registry/*.json` and `scripts/import-registry.ts` maps them to the schema columns and uploads them.

## Rules (they stop the AI from inventing supply chains)

1. **No quote, no supplier.** Every `supplier-of` row needs a source URL (the Apple Supplier List, a 10-K / 20-F / annual report, or the supplier's own site) and the exact sentence that proves the link. The offline `extract_suppliers` job on 0G proposes rows; **a person checks each quote against the source** before it goes in.
2. **No verified mint, no asset.** Each `asset` row's mint comes from the issuer's official list (xStocks, Ondo, Paxos, Tether, Coinbase) and is pasted with that list's URL. Never copy a mint from a DEX or aggregator.
3. **Untokenized is fine.** Companies without a token are still stored (`listed`, but no `asset`). They show as "not tokenized yet".
4. Everything marked ☐ below must be filled and checked before Fri 05:00.

## Products

| # | Product (category) | Maker (company_id) | Behind the product (role) | Materials | Notes |
|---|---|---|---|---|---|
| 1 | iPhone 17 (`smartphone`) | Apple (`co:apple`) | TSMC: makes the A19 chip ☐ quote · Qualcomm: 5G modem ☐ quote (check whether the iPhone 17 uses Apple's own modem; if so, drop Qualcomm) · Corning: cover glass ☐ quote · Broadcom: wireless parts ☐ · Foxconn: assembles the phone (not tokenized) | Gold, silver, aluminium, copper, lithium | Demo product |
| 2 | MacBook Air (`laptop`) | Apple | TSMC: M-series chip ☐ | Aluminium, gold | |
| 3 | AirPods (`audio`) | Apple | ☐ | Gold | Cheap demo receipt |
| 4 | Dove body wash (`personal_care`) | Unilever (`co:unilever`) | Surfactant suppliers (e.g. BASF, Dow) ☐ only with a quote | Palm oil (not tokenized) | |
| 5 | Lux / Surf (`personal_care`) | Unilever | — | — | Brand aliases only |
| 6 | Coca-Cola, Thums Up (`beverage`) | Coca-Cola (`co:cocacola`) | Can / bottle makers ☐ only with a quote | Aluminium (not tokenized) | Thums Up is owned by Coca-Cola |
| 7 | Lay's, Kurkure (`snack`) | PepsiCo (`co:pepsico`) | — | — | Kurkure is a PepsiCo India brand |
| 8 | Nike Pegasus (`shoes`) | Nike (`co:nike`) | ☐ | — | |
| 9 | Levi's 511 (`apparel`) | Levi Strauss & Co. (`co:levi`) | — | Cotton (not tokenized) | Check for a token (S9) |
| 10 | Gold jewellery (`jewellery`) | Titan (Tanishq), listed in India, not tokenized | — | Gold | Maker share goes to the fallback |
| 11 | Haldiram's Bhujia (`snack`) | Private | Packaging, edible oil, spices: none tokenized | — | Demo for "Brand not listed" |
| 12 | boAt earbuds (`audio`) | Imagine Marketing, private | — | — | Fallback |

Materials by category (`material-of`, payload `use`):
- `smartphone`: gold (circuit board contacts), silver (solder and contacts), aluminium (frame), copper (wiring), lithium (battery)
- `laptop`: aluminium (case), gold (contacts)
- `jewellery`: gold or silver (the item itself)
- `audio`: gold (contacts)

Only gold (GLDx / XAUt / PAXG) and silver (SLVon) have liquid tokens today. The rest show as "not tokenized yet".

## File format (`database/registry/apple-iphone.json`)

```json
{
  "brands":   [{ "name": "iPhone", "aliases": ["iphone 17", "iphone"], "company_id": "co:apple", "country": "US",
                 "ownerEvidence": "Wikidata ☐ (iPhone item): manufacturer Apple Inc." }],
  "companies":[{ "company_id": "co:apple", "name": "Apple Inc.", "ticker": "AAPL", "exchange": "NASDAQ", "listed": true, "wikidata_id": "Q312" }],
  "supplierOf":[{ "supplier_id": "co:tsmc", "customer_id": "co:apple", "product": "iphone",
                  "role": "Makes the A19 chip", "sourceUrl": "☐", "quote": "☐ exact sentence", "year": 2026 }],
  "materialOf":[{ "product_cat": "smartphone", "material": "mat:gold", "use": "Circuit board contacts" }],
  "assets":   [{ "asset_id": "co:apple", "chain": "solana", "issuer": "xStocks", "symbol": "AAPLx",
                 "mint": "☐", "decimals": "☐ read on-chain", "verifiedFrom": "☐ issuer list URL" }]
}
```

The import script refuses any file with a `☐` left in it, and any `supplierOf` row whose `quote` is shorter than 20 characters. Check `decimals` against the mint on-chain.

## Checklist

| ✓ | Item | Owner |
|---|---|---|
| ☐ | 12 product files written | B |
| ☐ | Every supplier quote checked by a person against its source | B |
| ☐ | Every mint copied from the issuer list (S9) and decimals checked on-chain | B |
| ☐ | Import run on Arkiv testnet; queries from [arkiv-schema.md](arkiv-schema.md) return the rows | B |
| ☐ | AI test set cases 1–15 resolve against this registry | B |
