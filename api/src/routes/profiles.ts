import type { FastifyInstance } from 'fastify'
import { v4 as uuid } from 'uuid'
import { getDb } from '../db/client.js'
import { verifyPassword } from '../crypto/argon.js'
import { deriveKey, generateSalt } from '../crypto/kdf.js'
import { encrypt, decrypt } from '../crypto/aes.js'
import { requireAuth } from '../auth/middleware.js'
import type { UserRow, ProfileRow, ProfilePII } from '../types.js'

export function registerProfileRoutes(app: FastifyInstance): void {

  app.get('/profiles', { preHandler: requireAuth }, async (req, reply) => {
    const db = getDb()
    const rows: ProfileRow[] = req.user.role === 'admin'
      ? db.prepare('SELECT id, user_id, label, created_at FROM profiles ORDER BY created_at DESC').all() as ProfileRow[]
      : db.prepare('SELECT id, user_id, label, created_at FROM profiles WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id) as ProfileRow[]
    return reply.send(rows)
  })

  app.post('/profiles', { preHandler: requireAuth }, async (req, reply) => {
    const { label, password, pii } = req.body as {
      label:    string
      password: string
      pii:      ProfilePII
    }

    if (!label || !password || !pii) {
      return reply.code(400).send({ error: 'label, password and pii required' })
    }

    const db = getDb()
    if (req.user.role === 'user') {
      const count = (db.prepare('SELECT count(*) as n FROM profiles WHERE user_id = ?').get(req.user.id) as { n: number }).n
      if (count >= 1) return reply.code(403).send({ error: 'Basic users can only have 1 profile' })
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) as UserRow
    if (!(await verifyPassword(password, user.password_hash))) {
      return reply.code(401).send({ error: 'Wrong password' })
    }

    const salt       = generateSalt()
    const key        = await deriveKey(password, salt)
    const blob       = encrypt(JSON.stringify(pii), key, salt)
    const id         = uuid()
    const created_at = new Date().toISOString()

    db.prepare(
      'INSERT INTO profiles (id, user_id, label, encrypted_pii, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, req.user.id, label, JSON.stringify(blob), created_at)

    return reply.code(201).send({ id, user_id: req.user.id, label, created_at })
  })

  app.get('/profiles/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()
    const profile = db.prepare('SELECT id, user_id, label, created_at FROM profiles WHERE id = ?').get(id) as ProfileRow | undefined

    if (!profile) return reply.code(404).send({ error: 'Profile not found' })
    if (req.user.role !== 'admin' && profile.user_id !== req.user.id) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    return reply.send(profile)
  })

  app.post('/profiles/:id/decrypt', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { password } = req.body as { password: string }

    if (!password) return reply.code(400).send({ error: 'password required' })

    const db = getDb()
    const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as ProfileRow | undefined
    if (!profile) return reply.code(404).send({ error: 'Profile not found' })
    if (req.user.role !== 'admin' && profile.user_id !== req.user.id) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) as UserRow
    if (!(await verifyPassword(password, user.password_hash))) {
      return reply.code(401).send({ error: 'Wrong password' })
    }

    const blob = JSON.parse(profile.encrypted_pii)
    const key  = await deriveKey(password, blob.salt)

    let pii: ProfilePII
    try {
      pii = JSON.parse(decrypt(blob, key)) as ProfilePII
    } catch {
      return reply.code(500).send({ error: 'Decryption failed' })
    }

    return reply.send({ id, label: profile.label, pii })
  })

  app.delete('/profiles/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()
    const profile = db.prepare('SELECT user_id FROM profiles WHERE id = ?').get(id) as { user_id: string } | undefined

    if (!profile) return reply.code(404).send({ error: 'Not found' })
    if (req.user.role !== 'admin' && profile.user_id !== req.user.id) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    db.prepare('DELETE FROM profiles WHERE id = ?').run(id)
    return reply.code(204).send()
  })
}
