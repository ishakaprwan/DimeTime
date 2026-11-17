-- store recurring planner events separately from one-off events
CREATE TABLE recurring_planner_items (
  id SERIAL PRIMARY KEY,

  user_id INTEGER NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  title VARCHAR(200) NOT NULL,

  item_type VARCHAR(20) NOT NULL
    CHECK (
      item_type IN (
        'university',
        'work',
        'personal',
        'money'
      )
    ),

  start_date DATE NOT NULL,

  start_time TIME,

  end_time TIME,

  notes TEXT,

  frequency VARCHAR(20) NOT NULL
    CHECK (
      frequency IN (
        'weekly',
        'fortnightly',
        'monthly'
      )
    ),

  repeat_until DATE,

  active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMP NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX recurring_planner_items_user_idx
ON recurring_planner_items(user_id);

CREATE INDEX recurring_planner_items_date_idx
ON recurring_planner_items(user_id, start_date);