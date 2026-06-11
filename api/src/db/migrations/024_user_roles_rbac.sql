-- Rework user roles: 2 roles (admin/user) → 4 hierarchical roles.
--   viewer   < editor < manager < admin
-- A higher rank inherits the rights of every lower rank. One role per user.
-- Plus profile_access: share a profile (read for viewer / act for editor) with a user.
--
-- SQLite cannot alter a CHECK constraint in place, so the users table is rebuilt
-- (12-step procedure). Legacy 'user' rows become 'manager' (they create/own profiles).

PRAGMA foreign_keys=OFF;
-- legacy_alter_table=ON keeps RENAME from rewriting child FK references
-- (invitations.created_by, etc.) to point at the temporary table name.
PRAGMA legacy_alter_table=ON;

-- Guard against a partial prior run leaving the temp table behind.
DROP TABLE IF EXISTS users_old;
ALTER TABLE users RENAME TO users_old;

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK(role IN ('admin','manager','editor','viewer')),
  created_at    TEXT NOT NULL,
  invited_by    TEXT REFERENCES users(id)
);

INSERT INTO users (id, email, password_hash, role, created_at, invited_by)
  SELECT id, email, password_hash,
         CASE role WHEN 'user' THEN 'manager' ELSE role END,
         created_at, invited_by
  FROM users_old;

DROP TABLE users_old;

PRAGMA legacy_alter_table=OFF;
PRAGMA foreign_keys=ON;

-- Per-profile sharing. Targets are viewer/editor users; a manager only ever
-- accesses profiles it owns, so it is never a share target.
CREATE TABLE IF NOT EXISTS profile_access (
  id         TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  granted_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE(profile_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_access_user ON profile_access(user_id);

-- Invitations carry the role the invitee will receive on registration.
ALTER TABLE invitations
  ADD COLUMN role TEXT NOT NULL DEFAULT 'manager'
  CHECK(role IN ('manager','editor','viewer'));
