# Arkiv schema

At submission this is copied to `/arkiv/schema.md` (prize rule).

**Verified 6 Nov against `@arkiv-network/sdk` 1.0.1 (npm `latest`) on the Rabdi testnet.** The read query below was type-checked and **run live**: [scripts/arkiv-check.ts](../scripts/arkiv-check.ts). The write call was type-checked but not run, because it needs tGLM from the faucet.

## Network

| Item | Value |
|---|---|
| Chain | Rabdi testnet: `rabdi` from `@arkiv-network/sdk/chains`, chain ID 7794095 |
| RPC | `https://rpc.rabdi.db-chain.testnet.arkiv.network` (via `rabdi({ accessKey })`; an empty key uses the heavily rate-limited public endpoint) |
| Access key | https://hub.arkiv.network/access-keys → `ARKIV_ACCESS_KEY` |
| Faucet (tGLM gas) | https://hub.arkiv.network/faucet |
| Explorer | https://rabdi.explorer.arkiv.network |
| Block time | 2 s |
| Max entity lifetime | About 182 days (`ExpirationTime.max()`); longer lifetimes throw |

**What changed from the old docs:**
- `expiresIn` (seconds) is now `expiration: ExpirationTime.fromDays(n)`.
- Payload / `contentType` are removed; data lives in typed schema columns.
- Only `.indexed()` columns can be filtered on.

## Security rule (A1)

> Anyone can write entities with our schema tag, and `changeOwnership` can hand an entity to our address.
> So **every read uses `.createdBy(WRITER).ownedBy(WRITER)`**, and a token mint is only trusted if it **also** matches `packages/shared/assets.ts`.

## Schemas (`lib/arkiv/schemas.ts`)

Schema names are versioned. A named schema tags each entity with `arkiv.schema`, so queries only see that schema.

```ts
import { defineSchema, str, u64 } from "@arkiv-network/sdk/schema"

export const Brand = defineSchema("ownback.brand.v1", {
  name_lc: str().indexed(), company_id: str().indexed(), country: str().indexed(),
  name: str(), aliases: str() /* JSON array */, owner_evidence: str(),
})
export const Company = defineSchema("ownback.company.v1", {
  company_id: str().indexed(), ticker: str().indexed(), exchange: str().indexed(), listed: u64().indexed(), wikidata_id: str(),
  name: str(), description: str(),
})
export const SupplierOf = defineSchema("ownback.supplier-of.v1", {
  supplier_id: str().indexed(), customer_id: str().indexed(), product: str().indexed(),
  role: str(), source_url: str(), quote: str(), year: u64(),
})
export const MaterialOf = defineSchema("ownback.material-of.v1", {
  product_cat: str().indexed(), material: str().indexed(), use: str(),
})
export const Asset = defineSchema("ownback.asset.v1", {
  asset_id: str().indexed(), chain: str().indexed(), issuer: str().indexed(),
  symbol: str(), mint: str(), decimals: u64(), verified_from: str(),
})
export const Proof = defineSchema("ownback.proof.v1", {
  asset_id: str().indexed(), week: str().indexed(), chain: str().indexed(),
  amount_usd6: u64(), qty: str(), fill_price_usd6: u64(), fees_usd6: u64(),
  arc_tx: str(), cctp_message: str(), venue_tx: str(), og_request_ids: str() /* JSON array */,
})
```

| Schema | Writer | Lifetime | Refresh |
|---|---|---|---|
| brand, company, supplier-of, material-of | Registry writer | `fromDays(180)` | Weekly job extends any with < 30 days left |
| asset | Registry writer | `fromDays(30)` | Re-verified against the issuer list before each extension; a missing entity pauses the jar |
| proof | Keeper writer | `fromDays(180)` | Extended while the user still holds the asset; tx hashes stay on-chain forever anyway |

**Never in any entity:** wallet address, email, user ID, shop name or receipt items.

## Queries the screens run

| Screen | Query |
|---|---|
| Confirm · maker | `.from(Brand).where(eq("name_lc", "dove"))` |
| Confirm · behind the product | `.from(SupplierOf).where(eq("customer_id", "co:apple"))` |
| Confirm · materials | `.from(MaterialOf).where(eq("product_cat", "smartphone"))` |
| Confirm / keeper · buyable | `.from(Asset).where(and(eq("asset_id", "co:tsmc"), eq("chain", "solana")))` |
| Fix the match | `.from(Company).where(eq("listed", u64(1n)))` + embeddings |
| Holding · proof trail | By entity key from `buy_entries.arkiv_key` |

Every one of them adds `.createdBy(writer).ownedBy(writer)`. The limit is 1..100 per page; use `.offset()` for more.

## Runnable query (for the README, prize rule)

```ts
import { createPublicClient } from "@arkiv-network/sdk"
import { rabdi } from "@arkiv-network/sdk/chains"
import { and, eq } from "@arkiv-network/sdk/query"
import { http, type Hex } from "viem"
import { SupplierOf } from "./schemas"

const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" })
const publicClient = createPublicClient({ chain, transport: http() })
const WRITER = process.env.ARKIV_WRITER_ADDRESS as Hex

const res = await publicClient
  .select({ $key: true, supplier_id: true, role: true, source_url: true, quote: true })
  .from(SupplierOf)
  .where(and(eq("customer_id", "co:apple")))
  .createdBy(WRITER)
  .ownedBy(WRITER)
  .limit(50)
  .fetch()
console.log(res.entities)   // TSMC "Makes the A19 chip", with the source quote
```

Run it with `npx tsx scripts/arkiv-check.ts read <writerAddress>`. On 6 Nov it returned 0 rows (nothing written yet) in about 0.4 s. A schema-less query on the same endpoint returned live entities, which confirms the client and query engine.

## Writes

```ts
const walletClient = createWalletClient({ chain, transport: http(), account: privateKeyToAccount(KEY) })
const { entityKey, txHash } = await walletClient.createEntity(
  SupplierOf,
  { supplier_id: "co:tsmc", customer_id: "co:apple", product: "iphone", role: "Makes the A19 chip",
    source_url: "<url>", quote: "<exact sentence>", year: u64(2026n) },
  { expiration: ExpirationTime.fromDays(180) },
)
```

- **Registry import** (`scripts/import-registry.ts`): upserts by a deterministic lookup (query first, then `patchEntity` or `createEntity`).
- **Proofs**: the keeper writes them in step 12 of the buy flow, through one queue so nonces don't collide.
- The README lists both writer addresses (prize rule).

## Friction log (start now; judges read `/arkiv/friction.md`)

- 6 Nov: the docs and older examples use `expiresIn` + `payload`. SDK 1.0 replaced them with schemas, `ExpirationTime` and typed columns, so we rewrote our schema.
- 6 Nov: the README install snippet shows `^0.9.0`, but npm `latest` is 1.0.1.
- 6 Nov: `u64` columns need the `u64()` constructor (a bare `bigint` doesn't type-check).
- 6 Nov: a schema-less `select().limit()` without `where` throws. Add a filter.
- 6 Nov: `ownedBy` alone isn't safe because `changeOwnership` exists. Use `createdBy` too.
- 7 Nov: `str` columns reject >128 UTF-8 bytes. `asset.verified_from` stores a short key (`issuer:kinds:date`); full evidence lives in `database/registry/assets-curated.json`.
