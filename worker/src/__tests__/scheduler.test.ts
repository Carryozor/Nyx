import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runDueSchedules } from '../scheduler.js'

function makeDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE profiles (id TEXT PRIMARY KEY, user_id TEXT, label TEXT, encrypted_pii TEXT, created_at TEXT);
    CREATE TABLE scan_schedules (
      id TEXT PRIMARY KEY, profile_id TEXT UNIQUE, interval_days INTEGER,
      next_run TEXT, last_run TEXT, enabled INTEGER DEFAULT 1, encrypted_schedule_key TEXT
    );
    CREATE TABLE scan_jobs (
      id TEXT PRIMARY KEY, profile_id TEXT, broker_ids TEXT, status TEXT,
      encrypted_job_key TEXT, created_at TEXT, started_at TEXT, finished_at TEXT, created_by TEXT
    );
  `)
  return db
}

describe('runDueSchedules', () => {
  it('creates no jobs when no schedules are due', () => {
    const db = makeDb()
    const future = new Date(Date.now() + 86400000).toISOString()
    db.prepare('INSERT INTO profiles VALUES (?,?,?,?,?)').run('p1','u1','Test','{}','2024-01-01')
    db.prepare('INSERT INTO scan_schedules VALUES (?,?,?,?,?,?,?)').run('s1','p1',30,future,null,1,'key')
    runDueSchedules(db)
    expect((db.prepare('SELECT * FROM scan_jobs').all() as unknown[]).length).toBe(0)
  })

  it('creates a scan job when schedule is due', () => {
    const db = makeDb()
    const past = new Date(Date.now() - 1000).toISOString()
    db.prepare('INSERT INTO profiles VALUES (?,?,?,?,?)').run('p1','u1','Test','{}','2024-01-01')
    db.prepare('INSERT INTO scan_schedules VALUES (?,?,?,?,?,?,?)').run('s1','p1',30,past,null,1,'key')
    runDueSchedules(db)
    const jobs = db.prepare('SELECT * FROM scan_jobs').all() as { profile_id: string }[]
    expect(jobs.length).toBe(1)
    expect(jobs[0].profile_id).toBe('p1')
  })

  it('updates next_run after creating a job', () => {
    const db = makeDb()
    const past = new Date(Date.now() - 1000).toISOString()
    db.prepare('INSERT INTO profiles VALUES (?,?,?,?,?)').run('p1','u1','Test','{}','2024-01-01')
    db.prepare('INSERT INTO scan_schedules VALUES (?,?,?,?,?,?,?)').run('s1','p1',7,past,null,1,'key')
    runDueSchedules(db)
    const sched = db.prepare('SELECT next_run FROM scan_schedules WHERE id=?').get('s1') as { next_run: string }
    expect(new Date(sched.next_run).getTime()).toBeGreaterThan(Date.now())
  })
})
