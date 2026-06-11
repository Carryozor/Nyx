import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db/client.js'
import { requireAdmin } from '../auth/middleware.js'
import type { UserRow } from '../types.js'

const ROLES = ['admin', 'manager', 'editor', 'viewer'] as const
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000'

function adminCount(db: ReturnType<typeof getDb>): number {
  return (db.prepare("SELECT count(*) as n FROM users WHERE role = 'admin'").get() as { n: number }).n
}

/** Admin user management: list, change role, delete. */
export function registerUserRoutes(app: FastifyInstance): void {

  app.get('/users', { preHandler: requireAdmin }, async (_req, reply) => {
    const rows = getDb().prepare(
      'SELECT id, email, role, created_at, invited_by FROM users WHERE id != ? ORDER BY created_at'
    ).all(SYSTEM_USER_ID) as Omit<UserRow, 'password_hash'>[]
    return reply.send(rows)
  })

  app.patch('/users/:id/role', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = z.object({ role: z.enum(ROLES) }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'role must be one of admin, manager, editor, viewer' })
    const { role } = parsed.data

    const db = getDb()
    const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id) as { id: string; role: string } | undefined
    if (!target) return reply.code(404).send({ error: 'User not found' })

    // Never strip the last admin (would lock the instance out of admin features).
    // Check + write atomically so two concurrent demotions can't both pass.
    try {
      db.transaction(() => {
        if (target.role === 'admin' && role !== 'admin' && adminCount(db) <= 1) throw new Error('last-admin')
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id)
      })()
    } catch (e) {
      if (e instanceof Error && e.message === 'last-admin') return reply.code(400).send({ error: 'Cannot demote the last admin' })
      throw e
    }
    return reply.send({ id, role })
  })

  app.delete('/users/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()
    const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id) as { id: string; role: string } | undefined
    if (!target) return reply.code(404).send({ error: 'User not found' })
    if (req.user.id === id) return reply.code(400).send({ error: 'You cannot delete your own account' })

    // Clear references that would block the delete (no cascade on these), then remove the
    // user — profiles, opt-outs and profile_access cascade via their own FKs. The last-admin
    // guard is inside the transaction so two concurrent deletes can't both pass.
    try {
      db.transaction(() => {
        if (target.role === 'admin' && adminCount(db) <= 1) throw new Error('last-admin')
        db.prepare('UPDATE users SET invited_by = NULL WHERE invited_by = ?').run(id)
        db.prepare('DELETE FROM invitations WHERE created_by = ?').run(id)
        db.prepare('DELETE FROM users WHERE id = ?').run(id)
      })()
    } catch (e) {
      if (e instanceof Error && e.message === 'last-admin') return reply.code(400).send({ error: 'Cannot delete the last admin' })
      throw e
    }

    return reply.code(204).send()
  })
}
