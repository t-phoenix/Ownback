-- D34–D37 · Markets: direct buy/sell, price history for sparklines and charts.

-- Ownback's own price history (hot set, every 5 min). Sparklines, 1D/1W charts, 24h change fallback.
CREATE TABLE IF NOT EXISTS price_ticks (
  asset_id text        NOT NULL,
  at       timestamptz NOT NULL,
  usd6     bigint      NOT NULL CHECK (usd6 > 0),
  PRIMARY KEY (asset_id, at)
);
CREATE INDEX IF NOT EXISTS price_ticks_at_idx ON price_ticks (at);

-- Cached OHLCV per mint and range (GeckoTerminal and/or our ticks). Display only.
CREATE TABLE IF NOT EXISTS candle_cache (
  mint       text        NOT NULL,
  range      text        NOT NULL CHECK (range IN ('1D', '1W', '1M', '3M', '1Y', 'ALL')),
  source     text        NOT NULL,
  payload    jsonb       NOT NULL,
  fetched_at timestamptz NOT NULL,
  PRIMARY KEY (mint, range)
);

-- Top pool per mint, for GeckoTerminal OHLCV.
CREATE TABLE IF NOT EXISTS market_pools (
  mint           text PRIMARY KEY,
  pool_address   text        NOT NULL,
  dex            text,
  liquidity_usd6 bigint,
  volume24h_usd6 bigint,
  checked_at     timestamptz NOT NULL
);

-- Market buys never touch jars (D35).
ALTER TABLE buy_batches DROP CONSTRAINT IF EXISTS buy_batches_trigger_check;
ALTER TABLE buy_batches ADD CONSTRAINT buy_batches_trigger_check CHECK (trigger IN ('approval', 'user', 'market'));

-- Sells: where they started, and the cost basis of what was sold (realised return).
ALTER TABLE sells ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'holding';
ALTER TABLE sells DROP CONSTRAINT IF EXISTS sells_source_check;
ALTER TABLE sells ADD CONSTRAINT sells_source_check CHECK (source IN ('holding', 'market'));
ALTER TABLE sells ADD COLUMN IF NOT EXISTS cost_basis_usd6 bigint;
