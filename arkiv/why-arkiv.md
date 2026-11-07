# Why Arkiv

Ownback tells a user which companies are behind a product they bought, then buys tokenized shares of them. That answer has to be something anyone can check, not something we assert from a private database.

| Need | Private database | Arkiv |
|---|---|---|
| Anyone can verify why a buy happened | Only we can read it | Public, queryable entities with a source URL and quote |
| A token mint can't be swapped quietly | We could edit a row with no trace | Each write is an on-chain tx from a known writer address |
| Readers can reject forgeries | Not applicable | `createdBy` + `ownedBy` our writer filters out anyone else using our schema tag |
| Stale facts don't live forever | Needs a cleanup job | Entities expire (30 days for assets, 180 for registry facts) unless we re-verify and extend them |
| Others can build on the data | Needs an API we run | Any app can query the same entities with the SDK |

## What stays private

User data never goes on Arkiv: no wallet address, email, user ID, shop name or receipt items. That lives in Postgres. Arkiv holds only public facts (brands, companies, supplier links, verified tokens) and anonymous buy proofs.
