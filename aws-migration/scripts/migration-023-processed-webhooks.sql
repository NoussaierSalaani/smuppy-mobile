-- Migration 023: Processed webhook events for idempotency
-- Required by: payments/webhook.ts

CREATE TABLE IF NOT EXISTS processed_webhook_events (
  event_id VARCHAR(255) PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_processed_webhooks_created ON processed_webhook_events(created_at);
