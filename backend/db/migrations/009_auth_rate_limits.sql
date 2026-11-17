-- store rate limits in PostgreSQL so they work across server restarts + instances
-- hash client IPs instead of storing the actual addresses
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  client_key CHAR(64) PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_window
ON auth_rate_limits (window_start);