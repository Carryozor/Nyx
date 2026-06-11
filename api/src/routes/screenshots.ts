import type { FastifyInstance } from 'fastify'
import fs from 'node:fs'
import path from 'node:path'
import { getDb } from '../db/client.js'
import { requireAuth } from '../auth/middleware.js'
import { requireProfileRead } from '../auth/access.js'
import { config } from '../config.js'

const FILENAME_RE = /^[a-z0-9_-]+\.png$/i

interface OptOutScreenshotRow {
  screenshot: string | null
  broker_id: string
  user_id: string
  profile_id: string
}

function resolveOptOut(id: string): OptOutScreenshotRow | null {
  const db = getDb()
  return db.prepare(`
    SELECT oor.screenshot, oor.broker_id, oor.profile_id, p.user_id
    FROM opt_out_requests oor
    JOIN profiles p ON p.id = oor.profile_id
    WHERE oor.id = ?
  `).get(id) as OptOutScreenshotRow | null
}

export function registerScreenshotRoutes(app: FastifyInstance): void {

  app.get('/opt-outs/:id/screenshots', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }

    const row = resolveOptOut(id)
    if (!row) return reply.code(404).send({ error: 'Not found' })
    if (!requireProfileRead(getDb(), req.user, row.profile_id, reply)) return
    if (!row.screenshot) return reply.send([])

    const dir = path.join(config.SCREENSHOT_DIR, row.screenshot, row.broker_id)
    if (!fs.existsSync(dir)) return reply.send([])

    const files = (fs.readdirSync(dir) as string[]).filter(f => FILENAME_RE.test(f))
    return reply.send(files.map(filename => ({
      filename,
      url: `/api/opt-outs/${id}/screenshot/${filename}`,
    })))
  })

  app.get('/opt-outs/:id/screenshot/:filename', { preHandler: requireAuth }, async (req, reply) => {
    const { id, filename } = req.params as { id: string; filename: string }

    if (!FILENAME_RE.test(filename)) {
      return reply.code(400).send({ error: 'Invalid filename' })
    }

    const row = resolveOptOut(id)
    if (!row) return reply.code(404).send({ error: 'Not found' })
    if (!requireProfileRead(getDb(), req.user, row.profile_id, reply)) return
    if (!row.screenshot) return reply.code(404).send({ error: 'No screenshots' })

    const filePath = path.join(config.SCREENSHOT_DIR, row.screenshot, row.broker_id, filename)
    if (!fs.existsSync(filePath)) return reply.code(404).send({ error: 'File not found' })

    return reply.type('image/png').send(fs.createReadStream(filePath))
  })
}
