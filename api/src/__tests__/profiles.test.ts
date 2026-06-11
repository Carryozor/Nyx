import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../app.js'
import { runMigrations } from '../db/migrate.js'
import { closeDb } from '../db/client.js'
import type { FastifyInstance } from 'fastify'

process.env.DB_PATH       = ':memory:'
process.env.JWT_SECRET    = 'a'.repeat(32)
process.env.WORKER_SECRET = 'b'.repeat(32)

let app: FastifyInstance
let sessionCookie: string

const PII = {
  firstName: 'Alice',
  lastName:  'Dupont',
  dob:       '1990-01-15',
  currentAddress: { street: '1 Rue de la Paix', city: 'Paris', country: 'FR' },
}

beforeEach(async () => {
  runMigrations()
  app = await buildApp()
  await app.ready()

  await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { email: 'admin@nyx.local', password: 'StrongPass1!' },
  })
  const login = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email: 'admin@nyx.local', password: 'StrongPass1!' },
  })
  sessionCookie = login.cookies.find(c => c.name === 'nyx_session')!.value
})

afterEach(async () => {
  await app.close()
  closeDb()
})

describe('POST /profiles', () => {
  it('creates a profile and stores PII encrypted (not plaintext)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/profiles',
      cookies: { nyx_session: sessionCookie },
      payload: { label: 'Alice', password: 'StrongPass1!', pii: PII },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.id).toBeTruthy()

    const { getDb } = await import('../db/client.js')
    const row = getDb().prepare('SELECT encrypted_pii FROM profiles WHERE id = ?').get(body.id) as { encrypted_pii: string }
    const blob = JSON.parse(row.encrypted_pii)
    expect(blob.ciphertext).toBeTruthy()
    expect(row.encrypted_pii).not.toContain('Alice')
  })

  it('rejects a wrong password', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/profiles',
      cookies: { nyx_session: sessionCookie },
      payload: { label: 'Alice', password: 'WrongPassword', pii: PII },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('professional profile (company block)', () => {
  const PRO_PII = {
    ...PII,
    company: { name: 'ACME SARL', siren: '123456789', siret: '12345678900012', legalForm: 'SARL' },
  }

  it('accepts a valid company block and round-trips it through decrypt', async () => {
    const create = await app.inject({
      method: 'POST', url: '/api/profiles',
      cookies: { nyx_session: sessionCookie },
      payload: { label: 'Pro', password: 'StrongPass1!', pii: PRO_PII },
    })
    expect(create.statusCode).toBe(201)
    const profileId = create.json().id

    const res = await app.inject({
      method: 'POST', url: `/api/profiles/${profileId}/decrypt`,
      cookies: { nyx_session: sessionCookie },
      payload: { password: 'StrongPass1!' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().pii.company).toEqual(PRO_PII.company)
  })

  it('rejects a SIREN that is not 9 digits', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/profiles',
      cookies: { nyx_session: sessionCookie },
      payload: { label: 'Bad', password: 'StrongPass1!', pii: { ...PII, company: { name: 'X', siren: '12' } } },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects a SIRET that is not 14 digits', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/profiles',
      cookies: { nyx_session: sessionCookie },
      payload: { label: 'Bad', password: 'StrongPass1!', pii: { ...PII, company: { name: 'X', siret: '999' } } },
    })
    expect(res.statusCode).toBe(400)
  })

  it('requires a company name when the company block is present', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/profiles',
      cookies: { nyx_session: sessionCookie },
      payload: { label: 'Bad', password: 'StrongPass1!', pii: { ...PII, company: { siren: '123456789' } } },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /profiles/:id/decrypt', () => {
  it('returns decrypted PII with correct password', async () => {
    const create = await app.inject({
      method: 'POST', url: '/api/profiles',
      cookies: { nyx_session: sessionCookie },
      payload: { label: 'Alice', password: 'StrongPass1!', pii: PII },
    })
    const profileId = create.json().id

    const res = await app.inject({
      method: 'POST', url: `/api/profiles/${profileId}/decrypt`,
      cookies: { nyx_session: sessionCookie },
      payload: { password: 'StrongPass1!' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().pii.firstName).toBe('Alice')
  })
})

describe('GET /profiles', () => {
  it('returns profiles list (no PII)', async () => {
    await app.inject({
      method: 'POST', url: '/api/profiles',
      cookies: { nyx_session: sessionCookie },
      payload: { label: 'Alice', password: 'StrongPass1!', pii: PII },
    })
    const res = await app.inject({
      method: 'GET', url: '/api/profiles',
      cookies: { nyx_session: sessionCookie },
    })
    expect(res.statusCode).toBe(200)
    const list = res.json()
    expect(list.length).toBe(1)
    expect(list[0].label).toBe('Alice')
    expect(list[0].encrypted_pii).toBeUndefined()
  })
})
