# Postgres schema

Neon Postgres + Drizzle ORM (`apps/web/lib/db/schema.ts`), with migrations in `apps/web/drizzle/`. This is migration **0001**; it freezes Fri 01:00. After that, changes are additive: new nullable columns or new tables.

Conventions:
- `id uuid` (v7, generated in the app)
- money is `bigint` micro-USDC, columns end in `_usd6`
- times are `timestamptz`
- enums are `text` + `CHECK`, with values from `packages/shared/states.ts`

## Tables

### users
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| auth_kind | text CHECK in (`privy`,`seed`,`google`) | `privy` is Google via Privy (Q9); `google` legacy |
| privy_did | text UNIQUE NULL | Privy DID (Q9) |
| circle_user_id | text UNIQUE NULL | Legacy Circle user id; may mirror privy_did during migration |
| email | text NULL | Privy / Google |
| display_name | text | First name or "You" |
| evm_address | text UNIQUE NULL | Checksummed. Same on Arc, Base, Ethereum, Arbitrum (S6) |
| sol_address | text UNIQUE NULL | |
| sol_usdc_ata | text NULL | USDC ATA **derived** from `sol_address` (D28). Must equal vault `solanaRecipient`. Not an RWA ATA. On-chain changes take 48 h (A6) |
| referral_code | text UNIQUE | e.g. `ABHI42` |
| referred_by | uuid NULL FK users | From the `ob_ref` cookie at sign-up |
| country | text NULL | From the edge at sign-up |
| created_at | timestamptz default now() | |

### wallets (only if S6 = different addresses per chain)
| user_id FK | chain text | address text | circle_wallet_id text NULL | PK (user_id, chain) |

### auth_nonces
| nonce text PK | expires_at timestamptz | used_at timestamptz NULL |

### sessions (A11)
| id text PK (random 32 bytes, base64url) | user_id FK | created_at | last_seen_at | expires_at (≤ created + 7 days) | user_agent text |

Deleted on sign-out; "sign out everywhere" deletes all rows for the user.

### rules
| Column | Type | Notes |
|---|---|---|
| user_id | uuid PK FK | |
| rate_bps | int CHECK 200–1000 | default 500 |
| monthly_cap_usd6 | bigint CHECK > 0 | default 50 000 000 |
| ready_min_usd6 | bigint CHECK > 0 | default 5 000 000 ($5 ready/reminder threshold, Q1) |
| fallback_asset | text | `idx:sp500` |
| split_maker / split_behind / split_materials | int | CHECK sum = 100; default 70/20/10 |
| buy_day | text | `sun` (reminder day, Q7) |
| max_fee_bps | int CHECK 50–1000 | default 500 (Q2) |
| auto_add | jsonb | `{ethereum:{on,capUsd6}, base:{…}, arbitrum:{…}}` (Q3) |
| onchain_synced_at | timestamptz NULL | Null → the next action prepends `setRules` |
| notify_buy_done / notify_needs_review / notify_near_limit | bool default true | |
| updated_at | timestamptz | |

### purchases
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | `onchain_id = keccak256(id)` computed, not stored |
| user_id | uuid FK | |
| source | text CHECK (`gmail`,`photo`,`voice`,`typed`) | |
| status | text CHECK (purchase states) | |
| shop, place | text NULL | Wiped on delete |
| items | jsonb NULL | `[{name, brand, qty}]`, wiped on delete |
| purchased_on | date NULL | |
| amount_local | numeric(14,2) NULL | |
| currency | char(3) NULL | |
| fx_rate | numeric(18,8) NULL | Local per USD, full precision |
| fx_source | text NULL | `frankfurter` / `cache` / `identity` |
| fx_date | date NULL | The rate's own date |
| amount_usd6 | bigint NULL | |
| rate_bps | int NULL | Snapshot at match time |
| invest_usd6 | bigint NULL | |
| split | jsonb NULL | `{maker, behind, materials}` used |
| rest_usd6 | bigint default 0 | Q7 |
| read_error | text NULL | |
| gmail_message_id | text NULL | UNIQUE (user_id, gmail_message_id) |
| confirm_tx | text NULL | Arc tx |
| created_at, updated_at | timestamptz | |

Indexes: `(user_id, created_at desc)`, `(user_id, status)`.

### allocations (one row per asset on a purchase)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| purchase_id | uuid FK | |
| asset_id | text | slug |
| role | text CHECK (`maker`,`supplier`,`material`,`fallback`) | |
| amount_usd6 | bigint | |
| selected | bool default true | Tick boxes |
| why | text NULL | "Makes the A19 chip" |
| source_url | text NULL | |
| arkiv_key | text NULL | supplier-of entity |
| saved_usd6 | bigint default 0 | From `Allocated` events |
| bought_usd6 | bigint default 0 | From buy entries |

UNIQUE `(purchase_id, asset_id)`.

### ai_runs
| id PK | purchase_id FK NULL | job text | model text | prompt_version text | og_request_id text | latency_ms int | ok bool | created_at |

No input or output stored.

### deposits
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| chain | text | |
| tx_hash | text | UNIQUE (chain, tx_hash) |
| from_address | text | |
| token | text | `USDC` or the symbol seen |
| amount_usd6 | bigint | |
| status | text CHECK (deposit states) | |
| confirmations | int | |
| slow | bool default false | |
| vault_tx | text NULL | |
| forward_tx | text NULL | Forwarder tx on the source chain (Q3) |
| fees_usd6 | bigint default 0 | |
| seen_at, added_at | timestamptz | |

### buy_approvals (Q7, A2)
| id uuid PK | user_id FK | hash bytea UNIQUE | typed_data jsonb | signature bytea | deadline timestamptz | status text (`signed`,`executing`,`used`,`expired`,`cancelled`) | max_fee_usd6 bigint | created_at |

### buy_batches
| id uuid PK | onchain_id bytea UNIQUE | trigger text (`approval`) | user_id uuid NULL | domain int | status text | total_usd6 bigint | arc_tx text | cctp_message text | mint_tx text | return_tx text NULL | fees_usd6 bigint | fees_covered bool | slow bool | started_at, finished_at |

### buy_entries
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| batch_id | uuid FK | |
| user_id | uuid FK | |
| asset_id | text | |
| status | text CHECK (entry states) | |
| amount_usd6 | bigint | Executed from the jar |
| spent_usd6 | bigint NULL | Actually swapped |
| approval_id | uuid FK buy_approvals | |
| item_index | int | Index in the signed approval |
| quote_price_usd6, ref_price_usd6, max_price_usd6, fill_price_usd6 | bigint | Per 1 unit of the token |
| fee_usd6, max_fee_usd6 | bigint | Actual vs signed share (Q2) |
| qty | numeric(38,18) NULL | From the balance change |
| venue | text | `jupiter` / `uniswap` / `appkit` / `aerodrome` / `pancakeswap` (+ `bridge` for BNB) |
| venue_tx | text NULL | |
| attempts | int default 0 | |
| arkiv_key | text NULL | Proof entity |

UNIQUE `(batch_id, user_id, asset_id)`. Index `(user_id, asset_id)` for Holding.

### withdrawals
| id PK | user_id FK | chain text | amount_usd6 bigint | fee_usd6 bigint | status text | arc_tx text | mint_tx text NULL | created_at |

### gmail_connections
| user_id PK FK | google_sub text | email text | scopes text[] | refresh_token_enc bytea | state text CHECK (gmail states) | progress_done int | progress_total int | last_scan_at timestamptz |

### gmail_messages
| user_id FK | message_id text | sender_domain text | status text CHECK (`new`,`added`,`not_product`,`matched`) | shop text NULL | summary text NULL | amount_local numeric | currency char(3) | amount_usd6 bigint | sent_on date | purchase_id uuid NULL | PK (user_id, message_id) |

### events (drives Activity and push)
| id uuid PK | user_id FK | kind text | payload jsonb | link text | created_at |

Index `(user_id, created_at desc)`.

### share_cards (A13)
| id text PK (random 128-bit) | user_id FK | asset_id NULL | batch_id NULL | show_amounts bool | revoked_at NULL | created_at |

### push_subscriptions
| id PK | user_id FK | endpoint text UNIQUE | keys jsonb | created_at |

### Caches and plumbing
| Table | Columns |
|---|---|
| fx_rates | (date, currency) PK, rate numeric(18,8), source, fetched_at |
| price_cache | (asset_id, chain) PK, usd6_per_unit bigint, ref_usd6 bigint, source, at |
| quotes | id PK, user_id, payload jsonb, expires_at (Buy review, 30 s) |
| idempotency_keys | (user_id, key) PK, request_hash, response jsonb, created_at (24 h) |
| chain_cursors | (chain, stream) PK, last_block bigint / last_signature text |
| keeper_lock | id int PK (single row), held_by text, held_at |
| price_ticks | (asset_id, at) PK, usd6 bigint. Markets hot set every 5 min, kept 8 days (D37) |
| candle_cache | (mint, range) PK, source, payload jsonb, fetched_at. Display only |
| market_pools | mint PK, pool_address, dex, liquidity_usd6, volume24h_usd6, checked_at (GeckoTerminal top pool, daily) |

Migration `0007_markets.sql` also allows `buy_batches.trigger = 'market'` (D35) and adds `sells.source` (`holding` \| `market`) and `sells.cost_basis_usd6`.

## Mirror rules

| Vault event | Writes |
|---|---|
| `Deposited` | deposits → added |
| `Allocated` | allocations.saved_usd6, purchases → saved |
| `JarCancelled` | events row |
| `Executed` / `BatchSent` | buy_entries / buy_batches |
| `ReturnedToJar` | buy_entries → returned |
| `Withdrawn` | withdrawals → sending / sent |

Jar balances are **not** stored. They are computed as Σ saved − Σ executed + Σ returned − cancelled, and checked against `vault.jarsOf` before every buy.

## Seed data for dev

`pnpm db:seed` loads the demo user "Abhi" with the wireframe numbers, using the corrected fixture from [docs/03](../docs/03-decisions-and-open-questions.md#wireframe-demo-data). That gives:
- 23 receipts
- $9,210 spending
- 11 assets
- the Croma iPhone purchase
- the 8 Nov and 1 Nov Apple buys
