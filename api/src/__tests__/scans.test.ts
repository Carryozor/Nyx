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

  await app.inject({ method: 'POST', url: '/api/auth/register',
    payload: { email: 'admin@nyx.local', password: 'StrongPass1!' } })
  const login = await app.inject({ method: 'POST', url: '/api/auth/login',
    payload: { email: 'admin@nyx.local', password: 'StrongPass1!' } })
  sessionCookie = login.cookies.find(c => c.name === 'nyx_session')!.value

  const pRes = await app.inject({ method: 'POST', url: '/api/profiles',
    cookies: { nyx_session: sessionCookie },
    payload: { label: 'Alice', password: 'StrongPass1!', pii: PII } })
  profileId = pRes.json().id
})

afterEach(async () => { await app.close(); closeDb() })

it('creates a scan job with encrypted_job_key', async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/scans',
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
    method: 'POST', url: '/api/scans',
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
    method: 'POST', url: '/api/scans',
    cookies: { nyx_session: sessionCookie },
    payload: { profileId, password: 'WrongPassword' },
  })
  expect(res.statusCode).toBe(401)
})

async function countOptOuts(): Promise<number> {
  return (getDb().prepare('SELECT count(*) as n FROM opt_out_requests WHERE profile_id = ?').get(profileId) as { n: number }).n
}

it("audience 'professional' targets professional+both brokers and excludes private-only", async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/scans',
    cookies: { nyx_session: sessionCookie },
    payload: { profileId, password: 'StrongPass1!', audience: 'professional' },
  })
  expect(res.statusCode).toBe(201)

  const db = getDb()
  const rows = db.prepare(`
    SELECT b.audience FROM opt_out_requests oor
    JOIN brokers b ON b.id = oor.broker_id WHERE oor.profile_id = ?
  `).all(profileId) as { audience: string }[]

  expect(rows.length).toBeGreaterThan(0)
  expect(rows.every(r => r.audience === 'professional' || r.audience === 'both')).toBe(true)
  expect(rows.some(r => r.audience === 'private')).toBe(false)
  // altares is professional → must be included
  const hasAltares = db.prepare("SELECT 1 FROM opt_out_requests WHERE profile_id=? AND broker_id='altares'").get(profileId)
  expect(hasAltares).toBeTruthy()
})

it("audience 'private' excludes professional-only brokers but keeps both", async () => {
  await app.inject({
    method: 'POST', url: '/api/scans',
    cookies: { nyx_session: sessionCookie },
    payload: { profileId, password: 'StrongPass1!', audience: 'private' },
  })
  const db = getDb()
  const rows = db.prepare(`
    SELECT b.audience FROM opt_out_requests oor
    JOIN brokers b ON b.id = oor.broker_id WHERE oor.profile_id = ?
  `).all(profileId) as { audience: string }[]

  expect(rows.some(r => r.audience === 'professional')).toBe(false)
  expect(rows.some(r => r.audience === 'private')).toBe(true)
  const hasAltares = db.prepare("SELECT 1 FROM opt_out_requests WHERE profile_id=? AND broker_id='altares'").get(profileId)
  expect(hasAltares).toBeFalsy()
})

it("audience 'both' (default) targets every active auto/semi broker", async () => {
  await app.inject({
    method: 'POST', url: '/api/scans',
    cookies: { nyx_session: sessionCookie },
    payload: { profileId, password: 'StrongPass1!', audience: 'both' },
  })
  const both = await countOptOuts()

  // wipe and re-run with no audience → identical default behaviour
  getDb().prepare('DELETE FROM opt_out_requests WHERE profile_id=?').run(profileId)
  await app.inject({
    method: 'POST', url: '/api/scans',
    cookies: { nyx_session: sessionCookie },
    payload: { profileId, password: 'StrongPass1!' },
  })
  const dflt = await countOptOuts()
  expect(dflt).toBe(both)
})

it('persists the resolved broker set in scan_jobs.broker_ids so the worker honours the audience filter', async () => {
  // Regression: worker falls back to ALL auto/semi brokers when broker_ids is NULL,
  // which would silently bypass the audience filter at execution time.
  const res = await app.inject({
    method: 'POST', url: '/api/scans',
    cookies: { nyx_session: sessionCookie },
    payload: { profileId, password: 'StrongPass1!', audience: 'private' },
  })
  expect(res.statusCode).toBe(201)

  const db = getDb()
  const row = db.prepare('SELECT broker_ids FROM scan_jobs WHERE profile_id=? ORDER BY created_at DESC LIMIT 1').get(profileId) as { broker_ids: string | null }
  expect(row.broker_ids).not.toBeNull()
  const stored: string[] = JSON.parse(row.broker_ids!)
  expect(stored).not.toContain('altares') // professional-only broker excluded from a private scan

  // The stored set matches exactly the opt_out_requests created.
  const optBrokers = (db.prepare('SELECT broker_id FROM opt_out_requests WHERE profile_id=?').all(profileId) as { broker_id: string }[]).map(r => r.broker_id)
  expect(stored.slice().sort()).toEqual(optBrokers.slice().sort())
})

it('explicit brokerIds take precedence over audience', async () => {
  await app.inject({
    method: 'POST', url: '/api/scans',
    cookies: { nyx_session: sessionCookie },
    payload: { profileId, password: 'StrongPass1!', audience: 'private', brokerIds: ['altares'] },
  })
  const db = getDb()
  const rows = db.prepare('SELECT broker_id FROM opt_out_requests WHERE profile_id=?').all(profileId) as { broker_id: string }[]
  expect(rows).toHaveLength(1)
  expect(rows[0].broker_id).toBe('altares')
})

it('encrypted_job_key uses a different random salt each time', async () => {
  const r1 = await app.inject({ method: 'POST', url: '/api/scans',
    cookies: { nyx_session: sessionCookie },
    payload: { profileId, password: 'StrongPass1!' } })
  const r2 = await app.inject({ method: 'POST', url: '/api/scans',
    cookies: { nyx_session: sessionCookie },
    payload: { profileId, password: 'StrongPass1!' } })
  expect(r1.statusCode).toBe(201)
  expect(r2.statusCode).toBe(201)

  const db = getDb()
  const k1 = JSON.parse((db.prepare('SELECT encrypted_job_key FROM scan_jobs WHERE id=?').get(r1.json().id) as { encrypted_job_key: string }).encrypted_job_key)
  const k2 = JSON.parse((db.prepare('SELECT encrypted_job_key FROM scan_jobs WHERE id=?').get(r2.json().id) as { encrypted_job_key: string }).encrypted_job_key)

  expect(k1.salt).not.toBe(k2.salt)
  expect(k1.ciphertext).not.toBe(k2.ciphertext)
})
