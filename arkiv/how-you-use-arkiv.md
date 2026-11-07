# How Ownback uses Arkiv

Network: Rabdi testnet (chain ID 7794095), `@arkiv-network/sdk` 1.0.1. Arkiv holds no money, so a testnet is fine; all money moves are on mainnet.

## Entities

| Schema | Holds | Lifetime | Status |
|---|---|---|---|
| `ownback.asset.v1` | Verified token per company and chain (mint, decimals, issuer, evidence key) | 30 days, re-verified before extending | **Written** when a registry candidate is promoted |
| `ownback.brand.v1` | Brand → company | 180 days | Specified |
| `ownback.company.v1` | Listed company, ticker, exchange | 180 days | Specified |
| `ownback.supplier-of.v1` | Supplier → customer, with source URL and quote | 180 days | Specified |
| `ownback.material-of.v1` | Product category → raw material | 180 days | Specified |
| `ownback.proof.v1` | Anonymous buy proof: asset, week, amounts, Arc/CCTP/venue tx, 0G request IDs | 180 days, extended while held | Specified |

Full columns: [schema.md](schema.md).

## Writes

- **Registry promote** ([backend/src/lib/registry/promote.ts](../backend/src/lib/registry/promote.ts)): once a token candidate passes three-source verification, `writeAssetToArkiv` ([write-asset.ts](../backend/src/lib/arkiv/write-asset.ts)) creates an `ownback.asset.v1` entity with `ExpirationTime.fromDays(30)` and returns the entity key and tx hash.
- **Proofs** (specified): after each buy, the keeper writes one `ownback.proof.v1`. The entity key is saved on the user's private buy row (`arkiv_key`), and the Holding screen links to it in the proof trail.

## Queries

**What the user sees (live):** on the Buy review screen, each token row is checked against Arkiv: `GET /api/buys/review` queries `ownback.asset.v1` by `asset_id` + `chain`, filtered `.createdBy(WRITER).ownedBy(WRITER)`, and keeps the record only if its mint equals our curated verified mint ([read-asset.ts](../backend/src/lib/arkiv/read-asset.ts)). A match shows **"Token verified on Arkiv"**, linking to the record in the Rabdi explorer (e.g. AAPLx: [0x269e…02bf](https://rabdi.explorer.arkiv.network/entity/0x269e5d7f9f76d7f79cef449469f38d12e8c9065b9a7f3e3039e9c019241802bf)).

Every read adds `.createdBy(WRITER).ownedBy(WRITER)`, and a mint is trusted only if it also matches `backend/src/shared/assets.ts`. The query for each screen is in [schema.md § Queries the screens run](schema.md#queries-the-screens-run). Runnable check: `npx tsx scripts/arkiv-check.ts read <writerAddress>`.

## Expiry

Registry facts get 180 days; a weekly job (`POST /api/jobs/arkiv/refresh`) is meant to extend any with fewer than 30 days left. Assets get 30 days and are re-verified against the issuer list before extension; if an asset entity is missing, that jar pauses instead of buying. The refresh job is a stub today (returns `extended: 0`).

## Writer

One writer wallet for now: `0xd20b3D166410e08BF58dbf2dc060E7580366B012` (registry). The keeper will write proofs from the same wallet until it gets its own.
