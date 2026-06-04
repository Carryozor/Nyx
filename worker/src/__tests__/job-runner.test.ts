import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { processNextJob } from '../job-runner.js'
import { encrypt } from '../crypto/aes.js'
import { reaperTick } from '../job-runner.js'

function makeDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE profiles (id TEXT PRIMARY KEY, user_id TEXT, label TEXT, encrypted_pii TEXT, created_at TEXT);
    CREATE TABLE brokers (id TEXT PRIMARY KEY, name TEXT, url TEXT, country TEXT, type TEXT, script_file TEXT, manual_guide TEXT, active INTEGER DEFAULT 1);
    CREATE TABLE opt_out_requests (id TEXT PRIMARY KEY, profile_id TEXT, broker_id TEXT, status TEXT, submitted_at TEXT, confirmed_at TEXT, last_attempt TEXT, attempts INTEGER DEFAULT 0, screenshot TEXT, notes TEXT);
    CREATE TABLE scan_jobs (id TEXT PRIMARY KEY, profile_id TEXT, broker_ids TEXT, status TEXT, encrypted_job_key TEXT, confirmation_email TEXT, created_at TEXT, started_at TEXT, finished_at TEXT, created_by TEXT);
    CREATE TABLE scan_events (id TEXT PRIMARY KEY, job_id TEXT, event_type TEXT, payload TEXT, created_at TEXT, broadcast INTEGER DEFAULT 0);
  `)
  return db
}

describe('processNextJob', () => {
  it('returns null when no queued jobs', async () => {
    const db = makeDb()
    const result = await processNextJob(db)
    expect(result).toBeNull()
  })

  it('marks job running/done/failed (not queued) after processing', async () => {
    const db = makeDb()
    const secret = 'b'.repeat(32)
    const workerKey = Buffer.from(secret.padEnd(32, '0').slice(0, 32))
    const fakePiiKey = Buffer.alloc(32, 0x42)
    const salt = Buffer.from(secret).toString('hex').slice(0, 64).padEnd(64, '0')
    const blob = encrypt(fakePiiKey.toString('hex'), workerKey, salt)

    // Profile with a minimal PII blob (encrypted with the piiKey — but for this test
    // the decryption will fail, so job should end as 'failed' which is acceptable)
    db.prepare('INSERT INTO profiles VALUES (?,?,?,?,?)').run('p1','u1','Test','{"salt":"aa","iv":"bb","ciphertext":"cc","authTag":"dd"}','2024-01-01')
    db.prepare('INSERT INTO scan_jobs (id,profile_id,broker_ids,status,encrypted_job_key,created_at,created_by) VALUES (?,?,?,?,?,?,?)').run(
      'j1','p1','["testbroker"]','queued', JSON.stringify(blob), '2024-01-01', 'u1'
    )

    const result = await processNextJob(db)
    expect(result).toBe('j1')

    const job = db.prepare('SELECT status FROM scan_jobs WHERE id=?').get('j1') as { status: string }
    expect(['running', 'done', 'failed']).toContain(job.status)
  })

  it('reaperTick requeues jobs stuck in running for over 10 minutes', async () => {
    const db = makeDb()
    const tenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    db.prepare("INSERT INTO scan_jobs VALUES ('j-stuck','p1',NULL,'running','{}',NULL,'2026-01-01',?,NULL,'u1')")
      .run(tenMinutesAgo)

    reaperTick(db)

    const job = db.prepare('SELECT status FROM scan_jobs WHERE id=?').get('j-stuck') as { status: string }
    expect(job.status).toBe('queued')
  })

  it('reaperTick does not requeue jobs running for less than 10 minutes', async () => {
    const db = makeDb()
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    db.prepare("INSERT INTO scan_jobs VALUES ('j-fresh','p1',NULL,'running','{}',NULL,'2026-01-01',?,NULL,'u1')")
      .run(twoMinutesAgo)

    reaperTick(db)

    const job = db.prepare('SELECT status FROM scan_jobs WHERE id=?').get('j-fresh') as { status: string }
    expect(job.status).toBe('running')
  })
})
