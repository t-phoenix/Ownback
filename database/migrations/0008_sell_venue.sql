-- D47: the exchange a sell was held to ('jupiter' = best route over every exchange; 'jupiter:<exchange>' = one).
ALTER TABLE sells ADD COLUMN IF NOT EXISTS venue text NOT NULL DEFAULT 'jupiter';
