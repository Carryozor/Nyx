-- Prevent double-processing of email webhooks (Cloudflare may retry on timeout).
CREATE TABLE IF NOT EXISTS webhook_seen (
  message_id   TEXT PRIMARY KEY,
  processed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webhook_seen_processed ON webhook_seen(processed_at);
