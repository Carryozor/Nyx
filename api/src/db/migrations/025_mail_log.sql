-- Journal of GDPR mails actually sent, for the Brevo daily-quota counter.
-- One row per successful send; the rolling 24h count gates new scans.
CREATE TABLE IF NOT EXISTS mail_log (
  id         TEXT PRIMARY KEY,
  profile_id TEXT,
  broker_id  TEXT,
  sent_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mail_log_sent_at ON mail_log(sent_at);
