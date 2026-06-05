CREATE TABLE IF NOT EXISTS endpoints (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL DEFAULT 'default',
  api_key       TEXT NOT NULL UNIQUE,
  destinations  TEXT NOT NULL DEFAULT '[]',
  plan          TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  email_to      TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhooks (
  id              TEXT PRIMARY KEY,
  endpoint_id     TEXT NOT NULL REFERENCES endpoints(id),
  method          TEXT NOT NULL,
  headers         TEXT NOT NULL,
  body            TEXT NOT NULL DEFAULT '',
  destinations    TEXT NOT NULL DEFAULT '[]',
  delivery_status TEXT NOT NULL DEFAULT 'pending',
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhooks_endpoint ON webhooks(endpoint_id, created_at DESC);

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
  meter_slug          TEXT NOT NULL,
  stripe_customer_id  TEXT,
  identifier          TEXT NOT NULL UNIQUE,
  value               INTEGER NOT NULL DEFAULT 1,
  occurred_at         TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  webhook_id          TEXT NOT NULL REFERENCES webhooks(id),
  created_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outcomes_status ON outcomes(status);
CREATE INDEX IF NOT EXISTS idx_outcomes_endpoint ON outcomes(endpoint_id, occurred_at);

CREATE TABLE IF NOT EXISTS transforms (
  id            TEXT PRIMARY KEY,
  endpoint_id   TEXT NOT NULL REFERENCES endpoints(id),
  prompt        TEXT NOT NULL,
  output_schema TEXT,
  model         TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
  enabled       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transforms_endpoint ON transforms(endpoint_id);

CREATE TABLE IF NOT EXISTS dead_letters (
  id              TEXT PRIMARY KEY,
  endpoint_id     TEXT NOT NULL REFERENCES endpoints(id),
  webhook_id      TEXT REFERENCES webhooks(id),
  destination_url TEXT NOT NULL,
  method          TEXT NOT NULL,
  headers         TEXT NOT NULL,
  body            TEXT NOT NULL,
  error           TEXT NOT NULL,
  status_code     INTEGER,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  max_retries     INTEGER NOT NULL DEFAULT 3,
  next_retry_at   TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dead_letters_endpoint ON dead_letters(endpoint_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dead_letters_retry ON dead_letters(next_retry_at) WHERE next_retry_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS email_destinations (
  id              TEXT PRIMARY KEY,
  endpoint_id     TEXT NOT NULL REFERENCES endpoints(id),
  email           TEXT NOT NULL,
  subject_template TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_dest_endpoint ON email_destinations(endpoint_id);

CREATE TABLE IF NOT EXISTS usage_events (
  id              TEXT PRIMARY KEY,
  endpoint_id     TEXT NOT NULL REFERENCES endpoints(id),
  event_type      TEXT NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 1,
  billing_period  TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_lookup ON usage_events(endpoint_id, event_type, billing_period);

CREATE TABLE IF NOT EXISTS scheduled_webhooks (
  id          TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL REFERENCES endpoints(id),
  cron        TEXT NOT NULL,
  method      TEXT NOT NULL DEFAULT 'POST',
  url         TEXT NOT NULL,
  headers     TEXT NOT NULL DEFAULT '{}',
  body        TEXT NOT NULL DEFAULT '',
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scheduled_endpoint ON scheduled_webhooks(endpoint_id);

PRAGMA journal_mode=WAL;
