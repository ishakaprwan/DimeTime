-- scheduled payments shouldnt count towards the recorded ledger until completed
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_status_check'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_status_check
      CHECK (status IN ('scheduled', 'completed'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_transactions_scheduled_user_date
  ON transactions(user_id, occurred_on)
  WHERE status = 'scheduled';

-- leave existing transactions as completed, even if their dates are in the future
-- dont automatically change any previously saved records