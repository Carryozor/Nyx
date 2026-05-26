import type { FastifyInstance } from 'fastify'
import crypto from 'node:crypto'
import { getDb } from '../db/client.js'
import { requireAdmin } from '../auth/middleware.js'
import type { InvitationRow } from '../types.js'

export function registerInvitationRoutes(app: FastifyInstance): void {

  app.post('/invitations', { preHandler: requireAdmin }, async (req, reply) => {
    const { email } = req.body as { email: string }
    if (!email) return reply.code(400).send({ error: 'email required' })

    const db         = getDb()
    const token      = crypto.randomBytes(32).toString('hex')
    const expires_at = new Date(Date.now() + 48 * 3600 * 1000).toISOString()

    db.prepare(
      'INSERT INTO invitations (token, email, created_by, expires_at) VALUES (?, ?, ?, ?)'
    ).run(token, email, req.user.id, expires_at)

    return reply.code(201).send({ token, email, expires_at })
  })

  app.get('/invitations', { preHandler: requireAdmin }, async (_req, reply) => {
    const rows = getDb().prepare(
      'SELECT token, email, created_by, expires_at, used_at FROM invitations ORDER BY expires_at DESC'
    ).all() as InvitationRow[]
    return reply.send(rows)
  })
}
