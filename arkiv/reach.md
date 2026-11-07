# Reach

The Ownback registry is a public dataset: which brand belongs to which listed company, who supplies whom (with a quote from a public filing), which raw materials go into a product category, and which on-chain token represents which company. Anyone can read it without asking us.

## Who else can use it

| Who | What they'd use | How |
|---|---|---|
| Tokenized-stock wallets and explorers | `ownback.asset.v1`: verified mint, decimals and issuer per company and chain | Query by `asset_id` + `chain`, filtered to our writer |
| Shopping, cashback and receipt apps | `ownback.brand.v1` + `ownback.company.v1`: brand → listed company | Query by `name_lc` |
| Supply-chain and ESG researchers | `ownback.supplier-of.v1` with source URL and quote | Query by `customer_id` or `supplier_id` |
| Index and basket builders | `ownback.material-of.v1` + supplier links to build "everything behind an iPhone" baskets | Join on company IDs |
| Auditors and users | `ownback.proof.v1`: anonymous record of each buy (asset, week, amount, tx hashes, 0G request IDs) | Look up by entity key from the app's proof trail |

## How to start

Use the runnable query in [schema.md](schema.md#runnable-query-for-the-readme-prize-rule) with our writer address from the [README](../README.md#arkiv). Always filter with `.createdBy(WRITER).ownedBy(WRITER)`.

**Status:** only `ownback.asset.v1` is written today. The other schemas are specified in [schema.md](schema.md).
