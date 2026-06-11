import type { FastifyInstance } from 'fastify'
import { getDb } from '../db/client.js'
import { requireAuth } from '../auth/middleware.js'
import { requireProfileRead } from '../auth/access.js'
import type { OptOutRequestRow } from '../types.js'

export function registerOptOutRoutes(app: FastifyInstance): void {

  app.get('/profiles/:id/opt-outs', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()

    const profile = db.prepare('SELECT user_id FROM profiles WHERE id = ?').get(id) as { user_id: string } | undefined
    if (!profile) return reply.code(404).send({ error: 'Profile not found' })
    if (!requireProfileRead(db, req.user, id, reply)) return

    const rows = db.prepare(`
      SELECT oor.*, b.name as broker_name, b.type as broker_type,
             b.url as broker_url, b.manual_guide
      FROM opt_out_requests oor
      JOIN brokers b ON b.id = oor.broker_id
      WHERE oor.profile_id = ?
      ORDER BY b.name
    `).all(id)

    return reply.send(rows)
  })

  app.get('/opt-outs/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()

    const row = db.prepare(`
      SELECT oor.*, b.name as broker_name, b.type as broker_type, b.manual_guide
      FROM opt_out_requests oor
      JOIN brokers b ON b.id = oor.broker_id
      WHERE oor.id = ?
    `).get(id) as (OptOutRequestRow & { broker_name: string; manual_guide: string | null }) | undefined

    if (!row) return reply.code(404).send({ error: 'Not found' })

    if (!requireProfileRead(db, req.user, row.profile_id, reply)) return

    return reply.send(row)
  })
}
