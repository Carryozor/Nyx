import type { FastifyInstance } from 'fastify'
import { v4 as uuid } from 'uuid'
import { getDb } from '../db/client.js'
import { verifyPassword } from '../crypto/argon.js'
import { deriveKey } from '../crypto/kdf.js'
import { encrypt } from '../crypto/aes.js'
import { requireAuth } from '../auth/middleware.js'
import type { UserRow, ProfileRow, EmailConfigRow } from '../types.js'

export function registerEmailConfigRoutes(app: FastifyInstance): void {

  app.post('/profiles/:id/email-config', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { password, provider, credentials } = req.body as {
      password:    string
      provider:    'simplelogin' | 'gmail'
      credentials: Record<string, string>
    }

    const db      = getDb()
    const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as ProfileRow | undefined
    if (!profile) return reply.code(404).send({ error: 'Not found' })
    if (req.user.role !== 'admin' && profile.user_id !== req.user.id) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) as UserRow
    if (!(await verifyPassword(password, user.password_hash))) {
      return reply.code(401).send({ error: 'Wrong password' })
    }

    const piiBlob = JSON.parse(profile.encrypted_pii)
    const key     = await deriveKey(password, piiBlob.salt)
    const blob    = encrypt(JSON.stringify(credentials), key, piiBlob.salt)

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
    if (req.user.role !== 'admin' && profile.user_id !== req.user.id) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    const row = db.prepare('SELECT id, profile_id, provider FROM email_configs WHERE profile_id = ?').get(id) as EmailConfigRow | undefined
    return reply.send(row ?? null)
  })

  app.delete('/profiles/:id/email-config', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()
    const profile = db.prepare('SELECT user_id FROM profiles WHERE id = ?').get(id) as { user_id: string } | undefined
    if (!profile) return reply.code(404).send({ error: 'Not found' })
    if (req.user.role !== 'admin' && profile.user_id !== req.user.id) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    db.prepare('DELETE FROM email_configs WHERE profile_id = ?').run(id)
    return reply.code(204).send()
  })
}
