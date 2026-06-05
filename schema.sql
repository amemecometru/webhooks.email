-- =============================================================================
--  webhooks.email  ·  Database Schema
--  D1 (SQLite-compatible)  ·  v1.0
-- =============================================================================

CREATE TABLE IF NOT EXISTS endpoints (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL DEFAULT 'default',
  api_key       TEXT NOT NULL UNIQUE,
  destinations  TEXT NOT NULL DEFAULT '[]',       -- JSON array of URLs
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhooks (
  id              TEXT PRIMARY KEY,
  endpoint_id     TEXT NOT NULL REFERENCES endpoints(id),
  method          TEXT NOT NULL,
  headers         TEXT NOT NULL,                  -- JSON object
  body            TEXT NOT NULL DEFAULT '',
  destinations    TEXT NOT NULL DEFAULT '[]',     -- JSON array of URLs
  delivery_status TEXT NOT NULL DEFAULT 'pending', -- pending|forwarding|forwarded|partial|failed
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhooks_endpoint ON webhooks(endpoint_id, created_at DESC);

-- =============================================================================
--  Stripe billing mirror (adapted from original schema)
--  Metered: successful webhook deliveries = billable outcomes
-- =============================================================================

CREATE TABLE IF NOT EXISTS stripe_customers (
  id                 TEXT PRIMARY KEY,
  endpoint_id        TEXT NOT NULL REFERENCES endpoints(id),
  stripe_customer_id TEXT NOT NULL UNIQUE,
  email              TEXT,
  created_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outcomes (
  id                  TEXT PRIMARY KEY,
  endpoint_id         TEXT NOT NULL REFERENCES endpoints(id),
  meter_slug          TEXT NOT NULL,              -- 'webhook_delivered'
  stripe_customer_id  TEXT,
  identifier          TEXT NOT NULL UNIQUE,       -- idempotency key
  value               INTEGER NOT NULL DEFAULT 1,
  occurred_at         TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',  -- pending|sent|failed|voided
  webhook_id          TEXT NOT NULL REFERENCES webhooks(id),
  created_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outcomes_status ON outcomes(status);
CREATE INDEX IF NOT EXISTS idx_outcomes_endpoint ON outcomes(endpoint_id, occurred_at);
