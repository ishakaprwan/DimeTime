-- store recurring income + expenses separately from recorded transactions
CREATE TABLE recurring_transactions (
  id SERIAL PRIMARY KEY,

  user_id INTEGER NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  category_id INTEGER
    REFERENCES categories(id)
    ON DELETE SET NULL,

  kind VARCHAR(20) NOT NULL
    CHECK (kind IN ('income', 'expense')),

  amount NUMERIC(12, 2) NOT NULL
    CHECK (amount > 0),

  description TEXT,

  frequency VARCHAR(20) NOT NULL
    CHECK (frequency IN ('weekly', 'monthly', 'termly')),

  next_date DATE NOT NULL,

  active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX recurring_transactions_user_id_idx
ON recurring_transactions(user_id);