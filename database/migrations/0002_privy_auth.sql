-- Q9: Privy Google wallets replace Circle user wallets.
-- Additive: allow auth_kind = privy; store Privy DID.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_auth_kind_check;
ALTER TABLE users ADD CONSTRAINT users_auth_kind_check
  CHECK (auth_kind IN ('google', 'seed', 'privy'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS privy_did text;
CREATE UNIQUE INDEX IF NOT EXISTS users_privy_did_uidx ON users (privy_did) WHERE privy_did IS NOT NULL;
