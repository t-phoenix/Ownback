CREATE TABLE IF NOT EXISTS sells (
  id              uuid PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  asset_id        text NOT NULL,
  status          text NOT NULL CHECK (status IN ('quoted', 'signing', 'sent', 'done', 'failed')),
  amount_raw      text NOT NULL,
  qty             text NOT NULL,
  received_usd6   bigint,
  venue_tx        text,
  quote_id        uuid REFERENCES quotes (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);

CREATE INDEX IF NOT EXISTS sells_user_idx ON sells (user_id, created_at DESC);
