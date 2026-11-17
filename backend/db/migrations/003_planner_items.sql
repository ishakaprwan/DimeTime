
-- keep one-off planner events separate from recurring schedules
CREATE TABLE planner_items (
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

  item_date DATE NOT NULL,

  start_time TIME,

  end_time TIME,

  notes TEXT,

  completed BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX planner_items_user_date_idx
ON planner_items(user_id, item_date);