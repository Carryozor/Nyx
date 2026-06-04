import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildApp } from '../app.js'
import { runMigrations } from '../db/migrate.js'
import { closeDb } from '../db/client.js'
import type { FastifyInstance } from 'fastify'

process.env.DB_PATH        = ':memory:'
process.env.JWT_SECRET     = 'a'.repeat(32)
process.env.WORKER_SECRET  = 'b'.repeat(32)
process.env.WEBHOOK_SECRET = 'test-webhook-secret-1234567890ab'

let app: FastifyInstance

const VALID_BODY = {
  'message-id': '<test-123@mail.example>',
  to:      'nyx-abc123@vidar.fr',
  from:    'noreply@suppression.peopleconnect.us',
  subject: 'Confirm your email address',
  html:    '<html><a href="https://suppression.peopleconnect.us/confirm?token=ABC">confirm</a></html>',
}

beforeEach(async () => {
  vi.resetAllMocks()
  runMigrations()
  app = await buildApp()
  await app.ready()
})
afterEach(async () => { await app.close(); closeDb() })

describe('POST /api/webhook/email', () => {
  it('returns 401 without Authorization header', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/webhook/email',
      payload: VALID_BODY })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 with wrong secret', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/webhook/email',
      headers: { authorization: 'Bearer wrong-secret' },
      payload: VALID_BODY })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 if secret is in query param (old behavior must be disabled)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhook/email?secret=test-webhook-secret-1234567890ab',
      payload: VALID_BODY })
    expect(res.statusCode).toBe(401)
  })

  it('accepts valid Authorization Bearer header', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/webhook/email',
      headers: { authorization: 'Bearer test-webhook-secret-1234567890ab' },
      payload: VALID_BODY })
    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)
  })

  it('is idempotent — duplicate message-id is skipped', async () => {
    const headers = { authorization: 'Bearer test-webhook-secret-1234567890ab' }
    const r1 = await app.inject({ method: 'POST', url: '/api/webhook/email', headers, payload: VALID_BODY })
    const r2 = await app.inject({ method: 'POST', url: '/api/webhook/email', headers, payload: VALID_BODY })
    expect(r1.json().ok).toBe(true)
    expect(r2.json().skipped).toMatch(/duplicate/)
  })

  it('does not crash on malformed subject for pattern matching', async () => {
    const headers = { authorization: 'Bearer test-webhook-secret-1234567890ab' }
    const body = { ...VALID_BODY, 'message-id': '<xss-test@mail.example>', subject: '../../../etc/passwd' }
    const res = await app.inject({ method: 'POST', url: '/api/webhook/email', headers, payload: body })
    expect(res.statusCode).toBe(200)
  })
})
