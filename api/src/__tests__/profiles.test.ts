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
    method: 'POST', url: '/auth/register',
    payload: { email: 'admin@nyx.local', password: 'StrongPass1!' },
  })
  const login = await app.inject({
    method: 'POST', url: '/auth/login',
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
      method: 'POST', url: '/profiles',
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
      method: 'POST', url: '/profiles',
      cookies: { nyx_session: sessionCookie },
      payload: { label: 'Alice', password: 'WrongPassword', pii: PII },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /profiles/:id/decrypt', () => {
  it('returns decrypted PII with correct password', async () => {
    const create = await app.inject({
      method: 'POST', url: '/profiles',
      cookies: { nyx_session: sessionCookie },
      payload: { label: 'Alice', password: 'StrongPass1!', pii: PII },
    })
    const profileId = create.json().id

    const res = await app.inject({
      method: 'POST', url: `/profiles/${profileId}/decrypt`,
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
      method: 'POST', url: '/profiles',
      cookies: { nyx_session: sessionCookie },
      payload: { label: 'Alice', password: 'StrongPass1!', pii: PII },
    })
    const res = await app.inject({
      method: 'GET', url: '/profiles',
      cookies: { nyx_session: sessionCookie },
    })
    expect(res.statusCode).toBe(200)
    const list = res.json()
    expect(list.length).toBe(1)
    expect(list[0].label).toBe('Alice')
    expect(list[0].encrypted_pii).toBeUndefined()
  })
})
