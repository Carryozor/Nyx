import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../app.js'
import { runMigrations } from '../db/migrate.js'
import { closeDb } from '../db/client.js'
import type { FastifyInstance } from 'fastify'

process.env.DB_PATH       = ':memory:'
process.env.JWT_SECRET    = 'a'.repeat(32)
process.env.WORKER_SECRET = 'b'.repeat(32)

let app: FastifyInstance
let adminCookie: string

beforeEach(async () => {
  runMigrations()
  app = await buildApp()
  await app.ready()
  await app.inject({ method: 'POST', url: '/api/auth/register',
    payload: { email: 'admin@nyx.local', password: 'StrongPass1!' } })
  const res = await app.inject({ method: 'POST', url: '/api/auth/login',
    payload: { email: 'admin@nyx.local', password: 'StrongPass1!' } })
  adminCookie = res.cookies.find(c => c.name === 'nyx_session')!.value
})
afterEach(async () => { await app.close(); closeDb() })

it('admin can create an invitation', async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/invitations',
    cookies: { nyx_session: adminCookie },
    payload: { email: 'newuser@nyx.local' },
  })
  expect(res.statusCode).toBe(201)
  expect(res.json().token).toBeTruthy()
})

it('invitation token can be used to register a new user', async () => {
  const invRes = await app.inject({
    method: 'POST', url: '/api/invitations',
    cookies: { nyx_session: adminCookie },
    payload: { email: 'newuser@nyx.local' },
  })
  const { token } = invRes.json()

  const regRes = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { email: 'newuser@nyx.local', password: 'AnotherPass1!', invitationToken: token },
  })
  expect(regRes.statusCode).toBe(201)
  expect(regRes.json().role).toBe('manager') // default invitation role
})

it('invitation carries the chosen role through to the registered user', async () => {
  const invRes = await app.inject({
    method: 'POST', url: '/api/invitations',
    cookies: { nyx_session: adminCookie },
    payload: { email: 'viewer@nyx.local', role: 'viewer' },
  })
  expect(invRes.statusCode).toBe(201)
  expect(invRes.json().role).toBe('viewer')
  const { token } = invRes.json()

  const regRes = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { email: 'viewer@nyx.local', password: 'ViewerPass1!', invitationToken: token },
  })
  expect(regRes.statusCode).toBe(201)
  expect(regRes.json().role).toBe('viewer')
})

it('rejects an invalid invitation role', async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/invitations',
    cookies: { nyx_session: adminCookie },
    payload: { email: 'x@nyx.local', role: 'admin' },
  })
  expect(res.statusCode).toBe(400)
})

it('invitation token cannot be reused', async () => {
  const invRes = await app.inject({
    method: 'POST', url: '/api/invitations',
    cookies: { nyx_session: adminCookie },
    payload: { email: 'newuser@nyx.local' },
  })
  const { token } = invRes.json()
  await app.inject({ method: 'POST', url: '/api/auth/register',
    payload: { email: 'newuser@nyx.local', password: 'AnotherPass1!', invitationToken: token } })

  const res2 = await app.inject({ method: 'POST', url: '/api/auth/register',
    payload: { email: 'third@nyx.local', password: 'ThirdPass1!', invitationToken: token } })
  expect(res2.statusCode).toBe(403)
})
