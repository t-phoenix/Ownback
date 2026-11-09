-- D30 · Analysis v2: async read steps, editable details, jury result, product cache.

ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_status_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_status_check CHECK (status IN (
  'reading', 'read_failed', 'needs_details', 'ready', 'needs_review', 'not_listed',
  'skipped', 'confirming', 'saved', 'deleted'
));

-- Real reading steps (Reading screen polls them). [{key, state, label}]
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS steps jsonb;
-- Editable fields from the read (PurchaseDetails + missing[]). No image, no raw text (docs/06).
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS details jsonb;
-- Jury result shown on Confirm (parent / enablers / commodities with status + agreement).
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS analysis jsonb;

CREATE INDEX IF NOT EXISTS purchases_status_updated_idx ON purchases (status, updated_at);

-- One jury verdict per normalised product key. Rows hold names/tickers/why only;
-- buyability is resolved again on every use (mints and routes change).
CREATE TABLE IF NOT EXISTS product_analyses (
  key           text PRIMARY KEY,
  label         text NOT NULL,
  source        text NOT NULL CHECK (source IN ('jury', 'seed')),
  verdict       jsonb NOT NULL,
  models        text[] NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
