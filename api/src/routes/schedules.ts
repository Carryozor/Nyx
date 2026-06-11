import type { FastifyInstance } from 'fastify'
import { v4 as uuid } from 'uuid'
import { getDb } from '../db/client.js'
import { deriveKey } from '../crypto/kdf.js'
import { config } from '../config.js'
import { encryptJobKey } from '../crypto/aes.js'
import { requireAuth } from '../auth/middleware.js'
import { requireProfileRead, requireProfileAction, verifyProfileMasterPassword } from '../auth/access.js'
import type { ProfileRow, ScanScheduleRow } from '../types.js'

export function registerScheduleRoutes(app: FastifyInstance): void {

  app.post('/profiles/:id/schedule', { preHandler: requireAuth, config: { rateLimit: { max: 15, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { password, intervalDays } = req.body as { password: string; intervalDays: number }

    if (!password || !intervalDays || intervalDays < 7) {
      return reply.code(400).send({ error: 'password and intervalDays (>=7) required' })
    }

    const db      = getDb()
    const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as ProfileRow | undefined
    if (!profile) return reply.code(404).send({ error: 'Not found' })
    if (!requireProfileAction(db, req.user, id, reply)) return

    if (!(await verifyProfileMasterPassword(db, id, password))) {
      return reply.code(401).send({ error: 'Wrong password' })
    }

    const piiBlob  = JSON.parse(profile.encrypted_pii)
    const piiKey   = await deriveKey(password, piiBlob.salt)
    const encKey   = JSON.stringify(encryptJobKey(piiKey, config.WORKER_SECRET))
    const next_run = new Date(Date.now() + intervalDays * 86400 * 1000).toISOString()
    const schedId  = uuid()

    db.prepare(`
      INSERT INTO scan_schedules (id, profile_id, interval_days, next_run, enabled, encrypted_schedule_key)
      VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT(profile_id) DO UPDATE SET
        interval_days = excluded.interval_days,
        next_run = excluded.next_run,
        enabled = 1,
        encrypted_schedule_key = excluded.encrypted_schedule_key
    `).run(schedId, id, intervalDays, next_run, encKey)

    return reply.code(201).send({ profile_id: id, interval_days: intervalDays, next_run, enabled: true })
  })

  app.delete('/profiles/:id/schedule', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()
    const profile = db.prepare('SELECT user_id FROM profiles WHERE id = ?').get(id) as { user_id: string } | undefined
    if (!profile) return reply.code(404).send({ error: 'Not found' })
    if (!requireProfileAction(db, req.user, id, reply)) return
    db.prepare('DELETE FROM scan_schedules WHERE profile_id = ?').run(id)
    return reply.code(204).send()
  })

  app.get('/profiles/:id/schedule', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()
    const profile = db.prepare('SELECT user_id FROM profiles WHERE id = ?').get(id) as { user_id: string } | undefined
    if (!profile) return reply.code(404).send({ error: 'Not found' })
    if (!requireProfileRead(db, req.user, id, reply)) return
    const row = db.prepare(
      'SELECT id, profile_id, interval_days, next_run, last_run, enabled FROM scan_schedules WHERE profile_id = ?'
    ).get(id) as Omit<ScanScheduleRow, 'encrypted_schedule_key'> | undefined
    return reply.send(row ?? null)
  })
}
