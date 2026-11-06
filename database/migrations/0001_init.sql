-- Ownback migration 0001 (database/schema.md). Freezes Fri 01:00; later changes additive only.
-- Money: bigint micro-USDC (*_usd6). Enums: text + CHECK (values from docs/04 → packages/shared/states.ts).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── users ────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id                uuid PRIMARY KEY,
  auth_kind         text NOT NULL CHECK (auth_kind IN ('google', 'seed')),
  circle_user_id    text UNIQUE,
  email             text,
  display_name      text NOT NULL,
  evm_address       text UNIQUE,
  sol_address       text UNIQUE,
  sol_usdc_ata      text,
  referral_code     text NOT NULL UNIQUE,
  referred_by       uuid REFERENCES users (id),
  country           text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- wallets: only if S6 = different addresses per chain (spike open). Table ready; unused when same SCA.
CREATE TABLE wallets (
  user_id           uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  chain             text NOT NULL,
  address           text NOT NULL,
  circle_wallet_id  text,
  PRIMARY KEY (user_id, chain)
);

CREATE TABLE auth_nonces (
  nonce             text PRIMARY KEY,
  expires_at        timestamptz NOT NULL,
  used_at           timestamptz
);

CREATE TABLE sessions (
  id                text PRIMARY KEY,
  user_id           uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  user_agent        text,
  CHECK (expires_at <= created_at + interval '7 days')
);

CREATE TABLE rules (
  user_id               uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  rate_bps              int NOT NULL DEFAULT 500 CHECK (rate_bps BETWEEN 200 AND 1000),
  monthly_cap_usd6      bigint NOT NULL DEFAULT 50000000 CHECK (monthly_cap_usd6 > 0),
  ready_min_usd6        bigint NOT NULL DEFAULT 5000000 CHECK (ready_min_usd6 > 0),
  fallback_asset        text NOT NULL DEFAULT 'idx:sp500',
  split_maker           int NOT NULL DEFAULT 70,
  split_behind          int NOT NULL DEFAULT 20,
  split_materials       int NOT NULL DEFAULT 10,
  buy_day               text NOT NULL DEFAULT 'sun',
  max_fee_bps           int NOT NULL DEFAULT 500 CHECK (max_fee_bps BETWEEN 50 AND 1000),
  auto_add              jsonb NOT NULL DEFAULT '{"ethereum":{"on":false,"capUsd6":"1000000000"},"base":{"on":false,"capUsd6":"1000000000"},"arbitrum":{"on":false,"capUsd6":"1000000000"}}'::jsonb,
  onchain_synced_at     timestamptz,
  notify_buy_done       boolean NOT NULL DEFAULT true,
  notify_needs_review   boolean NOT NULL DEFAULT true,
  notify_near_limit     boolean NOT NULL DEFAULT true,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (split_maker + split_behind + split_materials = 100)
);

CREATE TABLE purchases (
  id                  uuid PRIMARY KEY,
  user_id             uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  source              text NOT NULL CHECK (source IN ('gmail', 'photo', 'voice', 'typed')),
  status              text NOT NULL CHECK (status IN (
    'reading', 'read_failed', 'ready', 'needs_review', 'not_listed',
    'skipped', 'confirming', 'saved', 'deleted'
  )),
  shop                text,
  place               text,
  items               jsonb,
  purchased_on        date,
  amount_local        numeric(14, 2),
  currency            char(3),
  fx_rate             numeric(18, 8),
  fx_source           text,
  fx_date             date,
  amount_usd6         bigint,
  rate_bps            int,
  invest_usd6         bigint,
  split               jsonb,
  rest_usd6           bigint NOT NULL DEFAULT 0,
  read_error          text,
  gmail_message_id    text,
  confirm_tx          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, gmail_message_id)
);

CREATE INDEX purchases_user_created_idx ON purchases (user_id, created_at DESC);
CREATE INDEX purchases_user_status_idx ON purchases (user_id, status);

CREATE TABLE allocations (
  id              uuid PRIMARY KEY,
  purchase_id     uuid NOT NULL REFERENCES purchases (id) ON DELETE CASCADE,
  asset_id        text NOT NULL,
  role            text NOT NULL CHECK (role IN ('maker', 'supplier', 'material', 'fallback')),
  amount_usd6     bigint NOT NULL,
  selected        boolean NOT NULL DEFAULT true,
  why             text,
  source_url      text,
  arkiv_key       text,
  saved_usd6      bigint NOT NULL DEFAULT 0,
  bought_usd6     bigint NOT NULL DEFAULT 0,
  UNIQUE (purchase_id, asset_id)
);

CREATE TABLE ai_runs (
  id              uuid PRIMARY KEY,
  purchase_id     uuid REFERENCES purchases (id) ON DELETE SET NULL,
  job             text NOT NULL,
  model           text,
  prompt_version  text,
  og_request_id   text,
  latency_ms      int,
  ok              boolean NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE deposits (
  id              uuid PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  chain           text NOT NULL,
  tx_hash         text NOT NULL,
  from_address    text NOT NULL,
  token           text NOT NULL,
  amount_usd6     bigint NOT NULL,
  status          text NOT NULL CHECK (status IN (
    'seen', 'confirming', 'forwarding', 'needs_approval', 'moving',
    'added', 'below_min', 'wrong_token'
  )),
  confirmations   int NOT NULL DEFAULT 0,
  slow            boolean NOT NULL DEFAULT false,
  vault_tx        text,
  forward_tx      text,
  fees_usd6       bigint NOT NULL DEFAULT 0,
  seen_at         timestamptz NOT NULL DEFAULT now(),
  added_at        timestamptz,
  UNIQUE (chain, tx_hash)
);

CREATE TABLE buy_approvals (
  id              uuid PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  hash            bytea NOT NULL UNIQUE,
  typed_data      jsonb NOT NULL,
  signature       bytea NOT NULL,
  deadline        timestamptz NOT NULL,
  status          text NOT NULL CHECK (status IN ('signed', 'executing', 'used', 'expired', 'cancelled')),
  max_fee_usd6    bigint NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE buy_batches (
  id              uuid PRIMARY KEY,
  onchain_id      bytea UNIQUE,
  trigger         text NOT NULL CHECK (trigger IN ('approval')),
  user_id         uuid REFERENCES users (id) ON DELETE SET NULL,
  domain          int,
  status          text NOT NULL CHECK (status IN (
    'approved', 'executing', 'bridging', 'swapping', 'done', 'done_partial', 'failed'
  )),
  total_usd6      bigint NOT NULL DEFAULT 0,
  arc_tx          text,
  cctp_message    text,
  mint_tx         text,
  return_tx       text,
  fees_usd6       bigint NOT NULL DEFAULT 0,
  fees_covered    boolean NOT NULL DEFAULT false,
  slow            boolean NOT NULL DEFAULT false,
  started_at      timestamptz,
  finished_at     timestamptz
);

CREATE TABLE buy_entries (
  id                uuid PRIMARY KEY,
  batch_id          uuid NOT NULL REFERENCES buy_batches (id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  asset_id          text NOT NULL,
  status            text NOT NULL CHECK (status IN (
    'quoted', 'waiting', 'sent', 'bought', 'returning', 'returned', 'paused'
  )),
  amount_usd6       bigint NOT NULL,
  spent_usd6        bigint,
  approval_id       uuid NOT NULL REFERENCES buy_approvals (id),
  item_index        int NOT NULL,
  quote_price_usd6  bigint,
  ref_price_usd6    bigint,
  max_price_usd6    bigint,
  fill_price_usd6   bigint,
  fee_usd6          bigint,
  max_fee_usd6      bigint,
  qty               numeric(38, 18),
  venue             text NOT NULL,
  venue_tx          text,
  attempts          int NOT NULL DEFAULT 0,
  arkiv_key         text,
  UNIQUE (batch_id, user_id, asset_id)
);

CREATE INDEX buy_entries_user_asset_idx ON buy_entries (user_id, asset_id);

CREATE TABLE withdrawals (
  id              uuid PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  chain           text NOT NULL,
  amount_usd6     bigint NOT NULL,
  fee_usd6        bigint NOT NULL DEFAULT 0,
  status          text NOT NULL CHECK (status IN ('sending', 'sent', 'failed')),
  arc_tx          text,
  mint_tx         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE gmail_connections (
  user_id           uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  google_sub        text NOT NULL,
  email             text NOT NULL,
  scopes            text[] NOT NULL DEFAULT '{}',
  refresh_token_enc bytea,
  state             text NOT NULL CHECK (state IN (
    'none', 'no_access', 'scanning', 'found', 'caught_up', 'revoked'
  )),
  progress_done     int NOT NULL DEFAULT 0,
  progress_total    int NOT NULL DEFAULT 0,
  last_scan_at      timestamptz
);

CREATE TABLE gmail_messages (
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  message_id      text NOT NULL,
  sender_domain   text,
  status          text NOT NULL CHECK (status IN ('new', 'added', 'not_product', 'matched')),
  shop            text,
  summary         text,
  amount_local    numeric(14, 2),
  currency        char(3),
  amount_usd6     bigint,
  sent_on         date,
  purchase_id     uuid REFERENCES purchases (id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, message_id)
);

CREATE TABLE events (
  id              uuid PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind            text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  link            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX events_user_created_idx ON events (user_id, created_at DESC);

CREATE TABLE share_cards (
  id              text PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  asset_id        text,
  batch_id        uuid REFERENCES buy_batches (id) ON DELETE SET NULL,
  show_amounts    boolean NOT NULL DEFAULT false,
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE push_subscriptions (
  id              uuid PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  endpoint        text NOT NULL UNIQUE,
  keys            jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fx_rates (
  date            date NOT NULL,
  currency        char(3) NOT NULL,
  rate            numeric(18, 8) NOT NULL,
  source          text NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date, currency)
);

CREATE TABLE price_cache (
  asset_id        text NOT NULL,
  chain           text NOT NULL,
  usd6_per_unit   bigint NOT NULL,
  ref_usd6        bigint,
  source          text NOT NULL,
  at              timestamptz NOT NULL,
  PRIMARY KEY (asset_id, chain)
);

CREATE TABLE quotes (
  id              uuid PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  payload         jsonb NOT NULL,
  expires_at      timestamptz NOT NULL
);

CREATE TABLE idempotency_keys (
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key             text NOT NULL,
  request_hash    text NOT NULL,
  response        jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE chain_cursors (
  chain           text NOT NULL,
  stream          text NOT NULL,
  last_block      bigint,
  last_signature  text,
  PRIMARY KEY (chain, stream)
);

CREATE TABLE keeper_lock (
  id              int PRIMARY KEY CHECK (id = 1),
  held_by         text,
  held_at         timestamptz
);

INSERT INTO keeper_lock (id, held_by, held_at) VALUES (1, NULL, NULL);
