-- save monthly budget limits separately for each user + category
-- months without a saved limit should stay unknown
CREATE TABLE IF NOT EXISTS monthly_budget_limits (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month_start DATE NOT NULL,
  budget_limit NUMERIC(12,2) CHECK (budget_limit IS NULL OR budget_limit >= 0),
  PRIMARY KEY (user_id, category_id, month_start),
  CHECK (EXTRACT(DAY FROM month_start) = 1)
);

CREATE INDEX IF NOT EXISTS idx_monthly_budget_limits_user_month
ON monthly_budget_limits(user_id, month_start);

-- only carry existing category limits into the current month, not past months
INSERT INTO monthly_budget_limits (
  user_id,
  category_id,
  month_start,
  budget_limit
)
SELECT
  user_id,
  id,
  DATE_TRUNC('month', CURRENT_DATE)::date,
  budget_limit
FROM categories
WHERE kind = 'expense'
  AND budget_limit IS NOT NULL
ON CONFLICT (user_id, category_id, month_start) DO NOTHING;