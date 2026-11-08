-- UX onboarding ≠ vault setRules sync. onchain_synced_at stays for prepend-setRules.
ALTER TABLE rules ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

-- Users who already saved rules once (rules_changed event) skip the onboarding screen.
UPDATE rules r SET onboarded_at = COALESCE(r.onboarded_at, e.first_at)
FROM (
  SELECT user_id, MIN(created_at) AS first_at
  FROM events WHERE kind = 'rules_changed'
  GROUP BY user_id
) e
WHERE r.user_id = e.user_id AND r.onboarded_at IS NULL;
