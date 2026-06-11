import type { FastifyInstance } from 'fastify'
import { v4 as uuid } from 'uuid'
import { z } from 'zod'
import { getDb } from '../db/client.js'
import { verifyPassword } from '../crypto/argon.js'
import { encryptWithWorkerSecret } from '../crypto/aes.js'
import { config } from '../config.js'
import { requireAuth } from '../auth/middleware.js'
import { requireProfileRead, requireProfileAction } from '../auth/access.js'
import type { UserRow, ProfileRow, EmailConfigRow } from '../types.js'

const emailConfigSchema = z.object({
  password:    z.string().min(1),
  provider:    z.enum(['simplelogin', 'gmail']),
  credentials: z.record(z.string(), z.string()),
})

export function registerEmailConfigRoutes(app: FastifyInstance): void {

  app.post('/profiles/:id/email-config', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const bodyParsed = emailConfigSchema.safeParse(req.body)
    if (!bodyParsed.success) {
      return reply.code(400).send({ error: bodyParsed.error.issues[0]?.message ?? 'Invalid request body' })
    }
    const { password, provider, credentials } = bodyParsed.data

    const db      = getDb()
    const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as ProfileRow | undefined
    if (!profile) return reply.code(404).send({ error: 'Not found' })
    if (!requireProfileAction(db, req.user, id, reply)) return

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) as UserRow
    if (!(await verifyPassword(password, user.password_hash))) {
      return reply.code(401).send({ error: 'Wrong password' })
    }

    // Encrypt with the WORKER_SECRET (not the password) so the background worker can
    // decrypt the SimpleLogin key continuously, independent of transient scan job keys.
    const blob = encryptWithWorkerSecret(JSON.stringify(credentials), config.WORKER_SECRET)

    const configId = uuid()
    db.prepare(`
      INSERT INTO email_configs (id, profile_id, provider, encrypted_credentials)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(profile_id) DO UPDATE SET provider = excluded.provider, encrypted_credentials = excluded.encrypted_credentials
    `).run(configId, id, provider, JSON.stringify(blob))

    return reply.code(201).send({ id: configId, profile_id: id, provider })
  })

  app.get('/profiles/:id/email-config', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()
    const profile = db.prepare('SELECT user_id FROM profiles WHERE id = ?').get(id) as { user_id: string } | undefined
    if (!profile) return reply.code(404).send({ error: 'Not found' })
    if (!requireProfileRead(db, req.user, id, reply)) return
    const row = db.prepare('SELECT id, profile_id, provider FROM email_configs WHERE profile_id = ?').get(id) as EmailConfigRow | undefined
    return reply.send(row ?? null)
  })

  app.delete('/profiles/:id/email-config', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()
    const profile = db.prepare('SELECT user_id FROM profiles WHERE id = ?').get(id) as { user_id: string } | undefined
    if (!profile) return reply.code(404).send({ error: 'Not found' })
    if (!requireProfileAction(db, req.user, id, reply)) return
    db.prepare('DELETE FROM email_configs WHERE profile_id = ?').run(id)
    return reply.code(204).send()
  })
}
