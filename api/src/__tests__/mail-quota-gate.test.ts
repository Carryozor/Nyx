import { it, expect, beforeEach, afterEach } from 'vitest'
import { v4 as uuid } from 'uuid'
import { buildApp } from '../app.js'
import { runMigrations } from '../db/migrate.js'
import { closeDb, getDb } from '../db/client.js'
import type { FastifyInstance } from 'fastify'

process.env.DB_PATH       = ':memory:'
process.env.JWT_SECRET    = 'a'.repeat(32)
process.env.WORKER_SECRET = 'b'.repeat(32)

const DEFAULT_CAP = 300

let app: FastifyInstance
let cookie: string
let profileId: string

const PII = { firstName: 'A', lastName: 'B', dob: '1990-01-01', currentAddress: { street: '1', city: 'P', country: 'FR' } }

function seedMailLog(n: number) {
  const ins = getDb().prepare('INSERT INTO mail_log (id, profile_id, broker_id, sent_at) VALUES (?,?,?,?)')
  const now = new Date().toISOString()
  for (let i = 0; i < n; i++) ins.run(uuid(), profileId, 'x', now)
}

beforeEach(async () => {
  runMigrations()
  app = await buildApp()
  await app.ready()
  await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'a@nyx.local', password: 'StrongPass1!' } })
  cookie = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@nyx.local', password: 'StrongPass1!' } }))
    .cookies.find(c => c.name === 'nyx_session')!.value
  profileId = (await app.inject({ method: 'POST', url: '/api/profiles', cookies: { nyx_session: cookie }, payload: { label: 'P', password: 'StrongPass1!', pii: PII } })).json().id
})
afterEach(async () => { await app.close(); closeDb() })

it('allows a normal scan within the default budget', async () => {
  const res = await app.inject({ method: 'POST', url: '/api/scans', cookies: { nyx_session: cookie }, payload: { profileId, password: 'StrongPass1!' } })
  expect(res.statusCode).toBe(201)
})

it('blocks a scan when the daily budget is exhausted (409)', async () => {
  seedMailLog(DEFAULT_CAP) // remaining = 0
  const res = await app.inject({ method: 'POST', url: '/api/scans', cookies: { nyx_session: cookie }, payload: { profileId, password: 'StrongPass1!', brokerIds: ['altares'] } })
  expect(res.statusCode).toBe(409)
  const body = res.json()
  expect(body.cap).toBe(DEFAULT_CAP)
  expect(body.remaining).toBe(0)
  expect(body.estimate).toBe(1) // altares = 1 GDPR email
})

it('blocks when the estimate exceeds the remaining budget', async () => {
  seedMailLog(DEFAULT_CAP - 1) // remaining = 1, full scan emails many
  const res = await app.inject({ method: 'POST', url: '/api/scans', cookies: { nyx_session: cookie }, payload: { profileId, password: 'StrongPass1!' } })
  expect(res.statusCode).toBe(409)
  expect(res.json().estimate).toBeGreaterThan(1)
})

it('reserves the mail budget at scan creation (atomic gate)', async () => {
  const before = (await app.inject({ method: 'GET', url: '/api/mail-quota', cookies: { nyx_session: cookie } })).json().sent_today
  await app.inject({ method: 'POST', url: '/api/scans', cookies: { nyx_session: cookie }, payload: { profileId, password: 'StrongPass1!', brokerIds: ['altares'] } })
  const after = (await app.inject({ method: 'GET', url: '/api/mail-quota', cookies: { nyx_session: cookie } })).json().sent_today
  expect(after).toBe(before + 1) // altares = 1 reserved send
})

it('GET /mail-quota reports sent_today, cap and remaining', async () => {
  seedMailLog(10)
  const res = await app.inject({ method: 'GET', url: '/api/mail-quota', cookies: { nyx_session: cookie } })
  expect(res.statusCode).toBe(200)
  const body = res.json()
  expect(body.cap).toBe(DEFAULT_CAP)
  expect(body.sent_today).toBe(10)
  expect(body.remaining).toBe(DEFAULT_CAP - 10)
})
