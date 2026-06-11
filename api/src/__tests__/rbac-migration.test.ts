import { describe, it, expect, beforeAll } from 'vitest'

describe('RBAC migration (024)', () => {
  beforeAll(() => {
    process.env.DB_PATH       = ':memory:'
    process.env.JWT_SECRET    = 'a'.repeat(32)
    process.env.WORKER_SECRET = 'b'.repeat(32)
  })

  it('migrates the users.role CHECK to the 4-role set', async () => {
    const { runMigrations } = await import('../db/migrate.js')
    const { getDb, closeDb } = await import('../db/client.js')
    runMigrations()
    const db = getDb()

    // valid new roles accepted
    for (const role of ['admin', 'manager', 'editor', 'viewer']) {
      expect(() =>
        db.prepare('INSERT INTO users (id,email,password_hash,role,created_at) VALUES (?,?,?,?,?)')
          .run(`u-${role}`, `${role}@x.io`, 'h', role, '2026-01-01')
      ).not.toThrow()
    }
    // legacy 'user' rejected by the new constraint
    expect(() =>
      db.prepare('INSERT INTO users (id,email,password_hash,role,created_at) VALUES (?,?,?,?,?)')
        .run('u-bad', 'bad@x.io', 'h', 'user', '2026-01-01')
    ).toThrow()

    closeDb()
  })

  it('creates the profile_access table with a unique (profile_id,user_id)', async () => {
    const { runMigrations } = await import('../db/migrate.js')
    const { getDb, closeDb } = await import('../db/client.js')
    runMigrations()
    const db = getDb()

    const cols = (db.prepare('PRAGMA table_info(profile_access)').all() as { name: string }[]).map(c => c.name)
    expect(cols).toEqual(expect.arrayContaining(['id', 'profile_id', 'user_id', 'granted_by', 'created_at']))

    closeDb()
  })

  it('adds a role column to invitations defaulting to manager', async () => {
    const { runMigrations } = await import('../db/migrate.js')
    const { getDb, closeDb } = await import('../db/client.js')
    runMigrations()
    const db = getDb()
    const cols = (db.prepare('PRAGMA table_info(invitations)').all() as { name: string; dflt_value: string | null }[])
    const roleCol = cols.find(c => c.name === 'role')
    expect(roleCol).toBeTruthy()
    closeDb()
  })
})
