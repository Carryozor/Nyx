import type { FastifyInstance } from 'fastify'
import { v4 as uuid } from 'uuid'
import { getDb } from '../db/client.js'
import { requireAuth } from '../auth/middleware.js'
import { requireOwnerOrAdmin } from '../auth/access.js'
import type { UserRow } from '../types.js'

/**
 * Profile sharing: the owner of a profile (or an admin) grants a viewer/editor
 * read/act access to a specific profile via the profile_access table.
 * Managers are never share targets — their scope is the profiles they own.
 */
export function registerShareRoutes(app: FastifyInstance): void {

  app.post('/profiles/:id/shares', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { email } = req.body as { email?: string }
    if (!email) return reply.code(400).send({ error: 'email required' })

    const db = getDb()
    const profile = db.prepare('SELECT id FROM profiles WHERE id = ?').get(id)
    if (!profile) return reply.code(404).send({ error: 'Profile not found' })
    if (!requireOwnerOrAdmin(db, req.user, id, reply)) return

    const target = db.prepare('SELECT id, email, role FROM users WHERE email = ?').get(email) as UserRow | undefined
    if (!target) return reply.code(404).send({ error: 'No user with that email — invite them first' })
    if (target.role !== 'viewer' && target.role !== 'editor') {
      return reply.code(400).send({ error: 'Only viewer or editor users can be granted profile access' })
    }

    const existing = db.prepare('SELECT id FROM profile_access WHERE profile_id = ? AND user_id = ?').get(id, target.id)
    if (existing) return reply.code(409).send({ error: 'Already shared with this user' })

    db.prepare(
      'INSERT INTO profile_access (id, profile_id, user_id, granted_by, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(uuid(), id, target.id, req.user.id, new Date().toISOString())

    return reply.code(201).send({ profile_id: id, user_id: target.id, email: target.email, role: target.role })
  })

  app.get('/profiles/:id/shares', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()
    const profile = db.prepare('SELECT id FROM profiles WHERE id = ?').get(id)
    if (!profile) return reply.code(404).send({ error: 'Profile not found' })
    if (!requireOwnerOrAdmin(db, req.user, id, reply)) return

    const rows = db.prepare(`
      SELECT pa.user_id, u.email, u.role, pa.created_at
      FROM profile_access pa
      JOIN users u ON u.id = pa.user_id
      WHERE pa.profile_id = ?
      ORDER BY u.email
    `).all(id)
    return reply.send(rows)
  })

  app.delete('/profiles/:id/shares/:userId', { preHandler: requireAuth }, async (req, reply) => {
    const { id, userId } = req.params as { id: string; userId: string }
    const db = getDb()
    const profile = db.prepare('SELECT id FROM profiles WHERE id = ?').get(id)
    if (!profile) return reply.code(404).send({ error: 'Profile not found' })
    if (!requireOwnerOrAdmin(db, req.user, id, reply)) return

    const res = db.prepare('DELETE FROM profile_access WHERE profile_id = ? AND user_id = ?').run(id, userId)
    if (res.changes === 0) return reply.code(404).send({ error: 'Share not found' })
    return reply.code(204).send()
  })
}
