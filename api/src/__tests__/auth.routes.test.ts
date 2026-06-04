import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../app.js'
import { runMigrations } from '../db/migrate.js'
import { closeDb } from '../db/client.js'
import type { FastifyInstance } from 'fastify'

process.env.DB_PATH       = ':memory:'
process.env.JWT_SECRET    = 'a'.repeat(32)
process.env.WORKER_SECRET = 'b'.repeat(32)

let app: FastifyInstance

beforeEach(async () => {
  runMigrations()
  app = await buildApp()
  await app.ready()
})

afterEach(async () => {
  await app.close()
  closeDb()
})

describe('POST /auth/register', () => {
  it('creates the first user as admin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'admin@nyx.local', password: 'StrongPass1!' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.role).toBe('admin')
    expect(body.email).toBe('admin@nyx.local')
  })

  it('rejects a second registration without invitation', async () => {
    await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'admin@nyx.local', password: 'StrongPass1!' },
    })
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'user2@nyx.local', password: 'AnotherPass1!' },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('POST /auth/login', () => {
  it('returns 200 and sets nyx_session cookie', async () => {
    await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'admin@nyx.local', password: 'StrongPass1!' },
    })
    const res = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: 'admin@nyx.local', password: 'StrongPass1!' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.cookies.find(c => c.name === 'nyx_session')).toBeDefined()
  })

  it('returns 401 on wrong password', async () => {
    await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'admin@nyx.local', password: 'StrongPass1!' },
    })
    const res = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: 'admin@nyx.local', password: 'wrong' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /auth/me', () => {
  it('returns 401 without cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' })
    expect(res.statusCode).toBe(401)
  })

  it('returns current user with valid cookie', async () => {
    await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'admin@nyx.local', password: 'StrongPass1!' },
    })
    const loginRes = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: 'admin@nyx.local', password: 'StrongPass1!' },
    })
    const cookie = loginRes.cookies.find(c => c.name === 'nyx_session')!

    const meRes = await app.inject({
      method: 'GET', url: '/api/auth/me',
      cookies: { nyx_session: cookie.value },
    })
    expect(meRes.statusCode).toBe(200)
    expect(meRes.json().email).toBe('admin@nyx.local')
  })
})

describe('POST /auth/register — invitation atomicity', () => {
  it('cannot reuse the same invitation token in concurrent requests', async () => {
    await app.inject({ method: 'POST', url: '/api/auth/register',
      payload: { email: 'admin@nyx.local', password: 'StrongPass1!' } })
    const adminLogin = await app.inject({ method: 'POST', url: '/api/auth/login',
      payload: { email: 'admin@nyx.local', password: 'StrongPass1!' } })
    const adminCookie = adminLogin.cookies.find(c => c.name === 'nyx_session')!.value

    const invRes = await app.inject({ method: 'POST', url: '/api/invitations',
      cookies: { nyx_session: adminCookie },
      payload: { email: 'user@nyx.local' } })
    const { token } = invRes.json()

    const [r1, r2] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/auth/register',
        payload: { email: 'user@nyx.local', password: 'Pass1234!', invitationToken: token } }),
      app.inject({ method: 'POST', url: '/api/auth/register',
        payload: { email: 'user@nyx.local', password: 'Pass1234!', invitationToken: token } }),
    ])

    const successes = [r1, r2].filter(r => r.statusCode === 201)
    const failures   = [r1, r2].filter(r => r.statusCode >= 400)
    // Exactly one must succeed and one must fail
    expect(successes.length).toBe(1)
    expect(failures.length).toBe(1)
    expect([403, 409]).toContain(failures[0].statusCode)
  })
})
