import { v4 as uuid } from 'uuid'
import type Database from 'better-sqlite3'

export type EventType = 'progress' | 'broker_done' | 'complete'

export function emitEvent(
  db: Database.Database,
  jobId: string,
  eventType: EventType,
  payload: Record<string, unknown>,
): void {
  db.prepare(`
    INSERT INTO scan_events (id, job_id, event_type, payload, created_at, broadcast)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(uuid(), jobId, eventType, JSON.stringify(payload), new Date().toISOString())
}
