# Database

Ownback keeps two stores, split by one rule: **anything personal is private (Postgres); anything public and useful to others goes to Arkiv.**

| Doc | What it's for |
|---|---|
| [schema.md](schema.md) | Postgres (Neon) tables, columns, keys, indexes, migration 0001. **Freezes Fri 01:00** |
| [arkiv-schema.md](arkiv-schema.md) | Public entities on Arkiv, their attributes, owners, expiry and the queries screens run. Becomes `/arkiv/schema.md` for the prize |
| [registry-seed.md](registry-seed.md) | The ~10 products (brand → maker → suppliers → materials → verified tokens) we import before the demo |
| [data-privacy-and-security.md](data-privacy-and-security.md) | What we store, for how long, export and delete, access, backups |

| Store | Holds | Never holds |
|---|---|---|
| Postgres (Neon, branches `dev` + `demo`) | Users, rules, purchases (fields only), allocations, buys, deposits, withdrawals, Gmail state, events, caches | Images, audio, email bodies, seed phrases, private keys |
| Arkiv (testnet) | Brands, companies, supplier links with sources, verified tokens, anonymous buy proofs | Any address, email, shop name or user ID |
| The chain (Arc vault) | Rules, balances and jars per address | Anything off-chain |

The chain is the source of truth for money. Postgres **mirrors** vault events for fast screens. If they disagree, the chain wins, and the keeper re-reads it before every buy.
