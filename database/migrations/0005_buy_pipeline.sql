-- D29: user-funded buys. Arc USDC → vault.withdrawCrossChain → CCTP → user's Solana USDC ATA → user-signed Jupiter swap.

-- Returning users who already used the app skip the rules screen even without a rules_changed event.
UPDATE rules r SET onboarded_at = COALESCE(r.onboarded_at, r.updated_at)
WHERE r.onboarded_at IS NULL AND (
  EXISTS (SELECT 1 FROM purchases p WHERE p.user_id = r.user_id)
  OR EXISTS (SELECT 1 FROM deposits d WHERE d.user_id = r.user_id)
);

ALTER TABLE buy_batches DROP CONSTRAINT IF EXISTS buy_batches_status_check;
ALTER TABLE buy_batches ADD CONSTRAINT buy_batches_status_check CHECK (status IN (
  'approved', 'executing', 'bridging', 'attesting', 'minting', 'swap_ready', 'swapping',
  'done', 'done_partial', 'failed'
));
ALTER TABLE buy_batches DROP CONSTRAINT IF EXISTS buy_batches_trigger_check;
ALTER TABLE buy_batches ADD CONSTRAINT buy_batches_trigger_check CHECK (trigger IN ('approval', 'user'));
ALTER TABLE buy_batches ADD COLUMN IF NOT EXISTS bridge_usd6 bigint NOT NULL DEFAULT 0;
ALTER TABLE buy_batches ADD COLUMN IF NOT EXISTS cctp_attestation text;
ALTER TABLE buy_batches ADD COLUMN IF NOT EXISTS error text;
ALTER TABLE buy_batches ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE buy_entries ALTER COLUMN approval_id DROP NOT NULL;
ALTER TABLE buy_entries ADD COLUMN IF NOT EXISTS error text;
-- sha256 of the Solana message we built; a signed tx is only accepted if its message matches.
ALTER TABLE buy_entries ADD COLUMN IF NOT EXISTS swap_msg_hash text;
ALTER TABLE buy_entries ADD COLUMN IF NOT EXISTS qty_raw text;

ALTER TABLE sells ADD COLUMN IF NOT EXISTS swap_msg_hash text;
ALTER TABLE sells ADD COLUMN IF NOT EXISTS error text;

-- "Move to Arc": Solana USDC → CCTP → user's Arc wallet.
ALTER TABLE withdrawals DROP CONSTRAINT IF EXISTS withdrawals_status_check;
ALTER TABLE withdrawals ADD CONSTRAINT withdrawals_status_check CHECK (status IN (
  'sending', 'sent', 'failed', 'signing', 'attesting', 'minting'
));
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS sol_tx text;
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS swap_msg_hash text;
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS error text;
