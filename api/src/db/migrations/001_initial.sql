CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK(role IN ('admin','user')),
  created_at    TEXT NOT NULL,
  invited_by    TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS invitations (
  token       TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  created_by  TEXT NOT NULL REFERENCES users(id),
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);

CREATE TABLE IF NOT EXISTS profiles (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  encrypted_pii TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS brokers (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  url          TEXT NOT NULL,
  country      TEXT NOT NULL,
  type         TEXT NOT NULL CHECK(type IN ('auto','semi','manual')),
  script_file  TEXT,
  manual_guide TEXT,
  active       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS opt_out_requests (
  id           TEXT PRIMARY KEY,
  profile_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  broker_id    TEXT NOT NULL REFERENCES brokers(id),
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK(status IN ('pending','submitted','awaiting_email','confirmed','failed','manual')),
  submitted_at TEXT,
  confirmed_at TEXT,
  last_attempt TEXT,
  attempts     INTEGER NOT NULL DEFAULT 0,
  screenshot   TEXT,
  notes        TEXT,
  UNIQUE(profile_id, broker_id)
);

CREATE TABLE IF NOT EXISTS email_configs (
  id                     TEXT PRIMARY KEY,
  profile_id             TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  provider               TEXT NOT NULL CHECK(provider IN ('simplelogin','gmail')),
  encrypted_credentials  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_jobs (
  id                  TEXT PRIMARY KEY,
  profile_id          TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  broker_ids          TEXT,
  status              TEXT NOT NULL DEFAULT 'queued'
                        CHECK(status IN ('queued','running','done','failed')),
  encrypted_job_key   TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  started_at          TEXT,
  finished_at         TEXT,
  created_by          TEXT NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS scan_schedules (
  id                    TEXT PRIMARY KEY,
  profile_id            TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  interval_days         INTEGER NOT NULL DEFAULT 30,
  next_run              TEXT NOT NULL,
  last_run              TEXT,
  enabled               INTEGER NOT NULL DEFAULT 1,
  encrypted_schedule_key TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_events (
  id          TEXT PRIMARY KEY,
  job_id      TEXT NOT NULL REFERENCES scan_jobs(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL CHECK(event_type IN ('progress','broker_done','complete')),
  payload     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  broadcast   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_scan_jobs_status      ON scan_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scan_events_broadcast ON scan_events(broadcast);
CREATE INDEX IF NOT EXISTS idx_opt_outs_profile      ON opt_out_requests(profile_id);
