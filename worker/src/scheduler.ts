import { v4 as uuid } from 'uuid'
import type Database from 'better-sqlite3'

interface ScheduleRow {
  id: string
  profile_id: string
  interval_days: number
  next_run: string
  encrypted_schedule_key: string
}

export function runDueSchedules(db: Database.Database): void {
  const now = new Date().toISOString()

  const due = db.prepare(`
    SELECT * FROM scan_schedules WHERE enabled = 1 AND next_run <= ?
  `).all(now) as ScheduleRow[]

  for (const sched of due) {
    const jobId = uuid()
    db.prepare(`
      INSERT INTO scan_jobs (id, profile_id, broker_ids, status, encrypted_job_key, created_at, created_by)
      VALUES (?, ?, NULL, 'queued', ?, ?, 'scheduler')
    `).run(jobId, sched.profile_id, sched.encrypted_schedule_key, now)

    const nextRun = new Date(Date.now() + sched.interval_days * 86400 * 1000).toISOString()
    db.prepare(`UPDATE scan_schedules SET next_run=?, last_run=? WHERE id=?`)
      .run(nextRun, now, sched.id)

    console.log(`[scheduler] Created job ${jobId} for profile ${sched.profile_id}`)
  }
}

export function startScheduler(db: Database.Database): void {
  runDueSchedules(db)
  setInterval(() => runDueSchedules(db), 60_000)
}
