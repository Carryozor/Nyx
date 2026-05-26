import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../app.js'
import { runMigrations } from '../db/migrate.js'
import { closeDb, getDb } from '../db/client.js'
import type { FastifyInstance } from 'fastify'

process.env.DB_PATH       = ':memory:'
process.env.JWT_SECRET    = 'a'.repeat(32)
process.env.WORKER_SECRET = 'b'.repeat(32)

let app: FastifyInstance
let sessionCookie: string
let profileId: string

const PII = {
  firstName: 'Alice', lastName: 'Dupont', dob: '1990-01-15',
  currentAddress: { street: '1 Rue de la Paix', city: 'Paris', country: 'FR' },
}

beforeEach(async () => {
  runMigrations()
  app = await buildApp()
  await app.ready()

  await app.inject({ method: 'POST', url: '/auth/register',
    payload: { email: 'admin@nyx.local', password: 'StrongPass1!' } })
  const login = await app.inject({ method: 'POST', url: '/auth/login',
    payload: { email: 'admin@nyx.local', password: 'StrongPass1!' } })
  sessionCookie = login.cookies.find(c => c.name === 'nyx_session')!.value

  const pRes = await app.inject({ method: 'POST', url: '/profiles',
    cookies: { nyx_session: sessionCookie },
    payload: { label: 'Alice', password: 'StrongPass1!', pii: PII } })
  profileId = pRes.json().id
})

afterEach(async () => { await app.close(); closeDb() })

it('creates a scan job with encrypted_job_key', async () => {
  const res = await app.inject({
    method: 'POST', url: '/scans',
    cookies: { nyx_session: sessionCookie },
    payload: { profileId, password: 'StrongPass1!' },
  })
  expect(res.statusCode).toBe(201)
  const job = res.json()
  expect(job.id).toBeTruthy()
  expect(job.status).toBe('queued')

  const row = getDb().prepare('SELECT encrypted_job_key FROM scan_jobs WHERE id = ?').get(job.id) as { encrypted_job_key: string }
  const blob = JSON.parse(row.encrypted_job_key)
  expect(blob.ciphertext).toBeTruthy()
})

it('creates opt_out_requests for each auto broker', async () => {
  const res = await app.inject({
    method: 'POST', url: '/scans',
    cookies: { nyx_session: sessionCookie },
    payload: { profileId, password: 'StrongPass1!' },
  })
  res.json()

  const count = (getDb().prepare(
    'SELECT count(*) as n FROM opt_out_requests WHERE profile_id = ?'
  ).get(profileId) as { n: number }).n

  expect(count).toBeGreaterThan(10)
})

it('rejects wrong password', async () => {
  const res = await app.inject({
    method: 'POST', url: '/scans',
    cookies: { nyx_session: sessionCookie },
    payload: { profileId, password: 'WrongPassword' },
  })
  expect(res.statusCode).toBe(401)
})
