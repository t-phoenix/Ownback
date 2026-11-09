# Asset discovery (infinite catalog, no inventing)

Production buys only use mints that pass the **three-source + on-chain** gate and land in both `assets-curated.json` / `backend/src/shared/assets.ts` and Arkiv `ownback.asset.v1` (A1).

## Flow

```
scrape/curate issuer lists ──► candidates.json (proposed)
AI expands graph on demand ──┘
         │
         ▼
   verify (on-chain decimals; optional index re-check)
         │
         ▼
   promote only if evidence has issuer + index + onchain
         │
         ├──► assets-curated.json (source of truth)
         ├──► Arkiv asset entity (createdBy+ownedBy writer)
         └──► venues-ledger + chain-config ✓
```

## Evidence kinds

| Kind | Meaning | Example |
|---|---|---|
| `issuer` | Official issuer product/list URL that names the mint | https://xstocks.com/ `featuredProducts` |
| `index` | Independent index agreeing on the same mint | CoinGecko `platforms.solana` |
| `onchain` | Live RPC: mint exists, decimals match | Solana `getTokenSupply` |

Never copy a mint from a DEX page (DexScreener fakes). Untokenized assets stay in the company graph with **no** mint row.

## Files

| Path | Role |
|---|---|
| `database/registry/assets-curated.json` | Verified mints only |
| `database/registry/candidates.json` | Proposed mints (AI / scrape) |
| `scripts/scrape-xstocks.ts` | Pull issuer featured products → candidates |
| `scripts/verify-asset-mint.ts` | On-chain decimals check |
| `scripts/import-registry.ts` | Upsert verified assets to Arkiv |
| `POST /api/assets/candidates` | Propose |
| `POST /api/assets/candidates/:id/verify` | On-chain gate step |
| `POST /api/assets/candidates/:id/promote` | Three-source promote |

## Symbol → assetId (xStocks scrape)

Full map: `backend/src/lib/registry/symbol-map.ts` (generated for every three-source-verified xStock in `assets-curated.json`). Catalog tokens also carry `assetId` per symbol.
