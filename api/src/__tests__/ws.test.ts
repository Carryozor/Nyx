import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../app.js'
import { runMigrations } from '../db/migrate.js'
import { closeDb } from '../db/client.js'
import { WebSocket } from 'ws'
import type { FastifyInstance } from 'fastify'

process.env.DB_PATH       = ':memory:'
process.env.JWT_SECRET    = 'a'.repeat(32)
process.env.WORKER_SECRET = 'b'.repeat(32)

let app: FastifyInstance
let jwtToken: string

beforeEach(async () => {
  runMigrations()
  app = await buildApp()
  await app.ready()
  await app.listen({ port: 3099, host: '127.0.0.1' })

  const { signToken } = await import('../auth/jwt.js')
  jwtToken = signToken({ id: 'test-user', email: 'admin@nyx.local', role: 'admin' })
})

afterEach(async () => { await app.close(); closeDb() })

it('accepts a valid JWT and returns auth:ok', async () => {
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:3099/ws', {
      headers: { cookie: `nyx_session=${jwtToken}` },
    })
    ws.on('message', (raw: Buffer) => {
      const msg = JSON.parse(raw.toString())
      expect(msg.type).toBe('auth:ok')
      ws.close()
      resolve()
    })
    ws.on('error', reject)
    setTimeout(() => reject(new Error('timeout')), 3000)
  })
})
