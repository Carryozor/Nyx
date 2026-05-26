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

  await app.inject({ method: 'POST', url: '/auth/register',
    payload: { email: 'admin@nyx.local', password: 'StrongPass1!' } })
  await app.inject({ method: 'POST', url: '/auth/login',
    payload: { email: 'admin@nyx.local', password: 'StrongPass1!' } })

  const meRes = await app.inject({ method: 'GET', url: '/auth/me',
    headers: { cookie: (await app.inject({ method: 'POST', url: '/auth/login',
      payload: { email: 'admin@nyx.local', password: 'StrongPass1!' } })).headers['set-cookie'] as string }
  })
  const me = meRes.json()
  const { signToken } = await import('../auth/jwt.js')
  jwtToken = signToken({ id: me.id, email: me.email, role: me.role })
})

afterEach(async () => { await app.close(); closeDb() })

it('accepts a valid JWT and returns auth:ok', async () => {
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:3099/ws')
    ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token: jwtToken })))
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
