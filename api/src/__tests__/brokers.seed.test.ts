import { describe, it, expect, beforeAll } from 'vitest'

describe('broker seed', () => {
  beforeAll(() => {
    process.env.DB_PATH       = ':memory:'
    process.env.JWT_SECRET    = 'a'.repeat(32)
    process.env.WORKER_SECRET = 'b'.repeat(32)
  })

  it('seeds at least 15 auto brokers and 3 manual brokers', async () => {
    const { runMigrations } = await import('../db/migrate.js')
    const { getDb, closeDb } = await import('../db/client.js')
    runMigrations()
    const db = getDb()

    const auto   = (db.prepare("SELECT count(*) as n FROM brokers WHERE type='auto'").get() as { n: number }).n
    const manual = (db.prepare("SELECT count(*) as n FROM brokers WHERE type='manual'").get() as { n: number }).n

    expect(auto).toBeGreaterThanOrEqual(15)
    expect(manual).toBeGreaterThanOrEqual(3)

    closeDb()
  })
})
