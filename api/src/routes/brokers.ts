import type { FastifyInstance } from 'fastify'
import { getDb } from '../db/client.js'
import { requireAuth } from '../auth/middleware.js'
import type { BrokerRow } from '../types.js'

export function registerBrokerRoutes(app: FastifyInstance): void {

  app.get('/brokers', { preHandler: requireAuth }, async (req, reply) => {
    const { type } = req.query as { type?: string }
    const db = getDb()
    const rows: BrokerRow[] = type
      ? db.prepare('SELECT * FROM brokers WHERE active = 1 AND type = ? ORDER BY name').all(type) as BrokerRow[]
      : db.prepare('SELECT * FROM brokers WHERE active = 1 ORDER BY name').all() as BrokerRow[]
    return reply.send(rows)
  })

  app.get('/brokers/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const row = getDb().prepare('SELECT * FROM brokers WHERE id = ?').get(id) as BrokerRow | undefined
    if (!row) return reply.code(404).send({ error: 'Not found' })
    return reply.send(row)
  })
}
