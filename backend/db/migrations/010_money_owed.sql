-- keep personal debts separate from actual income and expenses
CREATE TABLE money_owed_records (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('owed_to_me', 'i_owe')),
  person TEXT NOT NULL CHECK (char_length(btrim(person)) BETWEEN 1 AND 120),
  reason TEXT NOT NULL DEFAULT '' CHECK (char_length(reason) <= 300),
  original_amount NUMERIC(12,2) NOT NULL CHECK (original_amount > 0),
  recorded_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_money_owed_user
ON money_owed_records(user_id, recorded_on DESC, id DESC);

CREATE TABLE money_owed_repayments (
  id BIGSERIAL PRIMARY KEY,
  record_id BIGINT NOT NULL REFERENCES money_owed_records(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  paid_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_money_owed_repayments_record
ON money_owed_repayments(record_id);