import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { emitEvent } from '../event-emitter.js'

function makeDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE scan_jobs (
      id TEXT PRIMARY KEY, profile_id TEXT, broker_ids TEXT,
      status TEXT, encrypted_job_key TEXT, created_at TEXT, created_by TEXT
    );
    CREATE TABLE scan_events (
      id TEXT PRIMARY KEY, job_id TEXT, event_type TEXT,
      payload TEXT, created_at TEXT, broadcast INTEGER DEFAULT 0
    );
  `)
  db.prepare('INSERT INTO scan_jobs VALUES (?,?,?,?,?,?,?)').run(
    'job1','prof1',null,'running','key','2024-01-01','user1'
  )
  return db
}

describe('emitEvent', () => {
  it('inserts a scan_event row', () => {
    const db = makeDb()
    emitEvent(db, 'job1', 'progress', { broker: 'spokeo', pct: 10 })
    const rows = db.prepare('SELECT * FROM scan_events').all() as { event_type: string; payload: string }[]
    expect(rows.length).toBe(1)
    expect(rows[0].event_type).toBe('progress')
    expect(JSON.parse(rows[0].payload).broker).toBe('spokeo')
  })

  it('sets broadcast=0 by default', () => {
    const db = makeDb()
    emitEvent(db, 'job1', 'broker_done', { broker: 'spokeo', status: 'submitted' })
    const row = db.prepare('SELECT broadcast FROM scan_events').get() as { broadcast: number }
    expect(row.broadcast).toBe(0)
  })
})
