import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'
import { countSentSince, estimateEmails } from '../mail-quota.js'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE mail_log (id TEXT PRIMARY KEY, profile_id TEXT, broker_id TEXT, sent_at TEXT NOT NULL);
  `)
})
afterEach(() => db.close())

describe('mail quota counting', () => {
  it('counts only mails sent within the window', () => {
    const now = Date.now()
    const within = new Date(now - 2 * 3600 * 1000).toISOString()   // 2h ago
    const old    = new Date(now - 30 * 3600 * 1000).toISOString()  // 30h ago
    db.prepare('INSERT INTO mail_log VALUES (?,?,?,?)').run(uuid(), 'p', 'b1', within)
    db.prepare('INSERT INTO mail_log VALUES (?,?,?,?)').run(uuid(), 'p', 'b2', within)
    db.prepare('INSERT INTO mail_log VALUES (?,?,?,?)').run(uuid(), 'p', 'b3', old)

    const since = new Date(now - 24 * 3600 * 1000).toISOString()
    expect(countSentSince(db, since)).toBe(2)
  })
})

describe('estimateEmails', () => {
  it('counts only brokers that have an opt_out_email', () => {
    const brokers = [
      { opt_out_email: 'dpo@a.com' },
      { opt_out_email: null },
      { opt_out_email: 'dpo@b.com' },
    ]
    expect(estimateEmails(brokers)).toBe(2)
  })

  it('returns 0 for an empty set', () => {
    expect(estimateEmails([])).toBe(0)
  })
})
