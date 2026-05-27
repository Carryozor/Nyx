INSERT OR IGNORE INTO users (id, email, password_hash, role, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'system@nyx.internal',
  'not-a-real-hash',
  'user',
  '2024-01-01T00:00:00.000Z'
);
