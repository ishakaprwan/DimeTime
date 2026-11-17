ALTER TABLE recurring_planner_items
DROP CONSTRAINT IF EXISTS recurring_planner_items_frequency_check;

ALTER TABLE recurring_planner_items
ADD CONSTRAINT recurring_planner_items_frequency_check
CHECK (
  frequency IN (
    'weekly',
    'fortnightly',
    'monthly',
    'yearly'
  )
);

-- let users remove one recurring date without deleting the whole series
CREATE TABLE IF NOT EXISTS recurring_planner_exceptions (
  id SERIAL PRIMARY KEY,

  user_id INTEGER NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  recurring_id INTEGER NOT NULL
    REFERENCES recurring_planner_items(id)
    ON DELETE CASCADE,

  occurrence_date DATE NOT NULL,

  created_at TIMESTAMP NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (recurring_id, occurrence_date)
);

CREATE INDEX IF NOT EXISTS recurring_planner_exceptions_user_idx
ON recurring_planner_exceptions(user_id);

CREATE INDEX IF NOT EXISTS recurring_planner_exceptions_recurring_idx
ON recurring_planner_exceptions(recurring_id);