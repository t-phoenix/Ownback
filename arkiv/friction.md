# Friction log

What was hard building Ownback on Arkiv (SDK `@arkiv-network/sdk` 1.0.1, Rabdi testnet), in the order we hit it.

| When | What happened | What we did |
|---|---|---|
| 6 Nov | Docs and older examples use `expiresIn` + `payload`. SDK 1.0 replaced them with schemas, `ExpirationTime` and typed columns. | Rewrote our schema around `defineSchema` and typed columns. |
| 6 Nov | The README install snippet shows `^0.9.0`, but npm `latest` is 1.0.1. | Pinned 1.0.1 and verified it with a live query ([scripts/arkiv-check.ts](../scripts/arkiv-check.ts)). |
| 6 Nov | `u64` columns need the `u64()` constructor; a bare `bigint` doesn't type-check. | Wrap every number in `u64(BigInt(n))`. |
| 6 Nov | A schema-less `select().limit()` without `where` throws. | Always add a filter. |
| 6 Nov | `ownedBy` alone isn't safe: anyone can write our schema tag, and `changeOwnership` can hand an entity to our address. | Every read uses `.createdBy(WRITER).ownedBy(WRITER)`, and a token mint must also match our curated asset list. |
| 7 Nov | `str` columns reject values over 128 UTF-8 bytes. | `asset.verified_from` stores a short key (`issuer:kinds:date`); the full evidence stays in `database/registry/assets-curated.json`. |
| 7 Nov | Writes need tGLM from the faucet, so a fresh writer can't write until a human funds it. | The writer skips cleanly (`ARKIV_KEYS_MISSING`) instead of failing the registry job. |
| 7 Nov | There's no built-in upsert; deduplicating needs a query and then `patchEntity` or `createEntity`. | Create-only for now ([write-asset.ts](../backend/src/lib/arkiv/write-asset.ts)); query-then-patch is next. |

## What would have helped

- One migration note from 0.9 → 1.0 (old field → new field).
- An `upsert` keyed on an indexed column.
- A warning in the docs that `ownedBy` is not a trust check on its own.
- The 128-byte `str` limit stated next to `str()`.
