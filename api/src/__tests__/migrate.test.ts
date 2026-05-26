import { describe, it, expect, beforeAll } from 'vitest'

describe('runMigrations', () => {
  beforeAll(() => {
    process.env.DB_PATH       = ':memory:'
    process.env.JWT_SECRET    = 'a'.repeat(32)
    process.env.WORKER_SECRET = 'b'.repeat(32)
  })

  it('creates all tables and tracks applied migrations', async () => {
    const { runMigrations } = await import('../db/migrate.js')
    const { getDb, closeDb } = await import('../db/client.js')

    runMigrations()
    const db = getDb()

    const tables = (db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[]).map(r => r.name)

    expect(tables).toContain('users')
    expect(tables).toContain('profiles')
    expect(tables).toContain('brokers')
    expect(tables).toContain('scan_jobs')
    expect(tables).toContain('opt_out_requests')
    expect(tables).toContain('email_configs')
    expect(tables).toContain('invitations')
    expect(tables).toContain('scan_schedules')
    expect(tables).toContain('scan_events')
    expect(tables).toContain('_migrations')

    closeDb()
    delete process.env.DB_PATH
  })
})
