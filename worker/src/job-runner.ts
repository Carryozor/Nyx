import pLimit from 'p-limit'
import type Database from 'better-sqlite3'
import { config } from './config.js'
import { decryptJobKey, decrypt } from './crypto/aes.js'
import { runBroker } from './broker-runner.js'
import { emitEvent } from './event-emitter.js'
import type { DecryptedPII } from './scripts/_types.js'

interface ScanJobRow {
  id: string
  profile_id: string
  broker_ids: string | null
  encrypted_job_key: string
  confirmation_email: string | null
}

interface ProfileRow {
  id: string
  encrypted_pii: string
}

interface BrokerRow { id: string }

const MAX_JOB_DURATION_MS = 10 * 60 * 1000  // 10 minutes

export function reaperTick(db: Database.Database): void {
  const cutoff = new Date(Date.now() - MAX_JOB_DURATION_MS).toISOString()
  // Mark stuck jobs as failed — we cannot re-queue because the worker cleared the
  // encrypted_job_key from memory on crash, making decryption impossible.
  const result = db.prepare(`
    UPDATE scan_jobs
    SET status = 'failed', finished_at = ?, encrypted_job_key = ''
    WHERE status = 'running' AND started_at < ?
  `).run(new Date().toISOString(), cutoff)
  if (result.changes > 0) {
    console.error(`[worker] reaper: marked ${result.changes} stuck job(s) as failed`)
  }
}

export async function processNextJob(db: Database.Database): Promise<string | null> {
  const job = db.prepare(`
    UPDATE scan_jobs SET status='running', started_at=?
    WHERE id = (SELECT id FROM scan_jobs WHERE status='queued' ORDER BY created_at LIMIT 1)
    RETURNING id, profile_id, broker_ids, encrypted_job_key, confirmation_email
  `).get(new Date().toISOString()) as ScanJobRow | undefined

  if (!job) return null

  try {
    const piiKey = decryptJobKey(job.encrypted_job_key, config.WORKER_SECRET)

    const profile = db.prepare('SELECT * FROM profiles WHERE id=?').get(job.profile_id) as ProfileRow
    const piiBlob = JSON.parse(profile.encrypted_pii)
    const pii: DecryptedPII = JSON.parse(decrypt(piiBlob, piiKey))

    // Scan-specific confirmation email (e.g. a SimpleLogin alias) overrides pii.email
    if (job.confirmation_email) pii.email = job.confirmation_email

    const brokerIds: string[] = job.broker_ids
      ? JSON.parse(job.broker_ids)
      : (db.prepare("SELECT id FROM brokers WHERE active=1 AND type IN ('auto','semi')").all() as BrokerRow[]).map(b => b.id)

    const limit = pLimit(config.MAX_CONCURRENT)
    await Promise.allSettled(
      brokerIds.map(brokerId => limit(() => runBroker(db, job.id, job.profile_id, brokerId, pii)))
    )

    db.prepare("UPDATE scan_jobs SET status='done', finished_at=?, encrypted_job_key='' WHERE id=?")
      .run(new Date().toISOString(), job.id)

    emitEvent(db, job.id, 'complete', { jobId: job.id, brokerCount: brokerIds.length })

  } catch (err) {
    db.prepare("UPDATE scan_jobs SET status='failed', finished_at=?, encrypted_job_key='' WHERE id=?")
      .run(new Date().toISOString(), job.id)
    console.error(`[worker] Job ${job.id} failed:`, err)
  }

  return job.id
}

export function startJobRunner(db: Database.Database): void {
  // Reap any jobs left in 'running' state from a previous crashed worker instance
  reaperTick(db)

  const poll = async () => {
    try {
      reaperTick(db)
      await processNextJob(db)
    } catch (err) { console.error('[worker] Poll error:', err) }
    setTimeout(poll, config.JOB_POLL_MS)
  }
  poll()
}
