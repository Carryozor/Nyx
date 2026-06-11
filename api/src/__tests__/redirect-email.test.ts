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

const PII = { firstName: 'A', lastName: 'B', dob: '1990-01-01', currentAddress: { street: '1', city: 'P', country: 'FR' } }

async function cookieFor(email: string): Promise<string> {
  return (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'StrongPass1!' } }))
    .cookies.find(c => c.name === 'nyx_session')!.value
}
async function makeUser(email: string, role: string): Promise<string> {
  const inv = await app.inject({ method: 'POST', url: '/api/invitations', cookies: { nyx_session: adminCookie }, payload: { email, role } })
  await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password: 'StrongPass1!', invitationToken: inv.json().token } })
  return cookieFor(email)
}

beforeEach(async () => {
  runMigrations()
  app = await buildApp()
  await app.ready()
  await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'admin@nyx.local', password: 'StrongPass1!' } })
  adminCookie = await cookieFor('admin@nyx.local')
})
afterEach(async () => { await app.close(); closeDb() })

describe('profile redirect_email', () => {
  it('is stored at creation and returned by GET /profiles/:id', async () => {
    const create = await app.inject({ method: 'POST', url: '/api/profiles', cookies: { nyx_session: adminCookie }, payload: { label: 'P', password: 'StrongPass1!', pii: PII, redirect_email: 'autre@autre.fr' } })
    const id = create.json().id
    const got = await app.inject({ method: 'GET', url: `/api/profiles/${id}`, cookies: { nyx_session: adminCookie } })
    expect(got.json().redirect_email).toBe('autre@autre.fr')
  })

  it('can be updated by an editor with access (editor+)', async () => {
    const manager = await makeUser('mgr@nyx.local', 'manager')
    const editor  = await makeUser('ed@nyx.local', 'editor')
    const id = (await app.inject({ method: 'POST', url: '/api/profiles', cookies: { nyx_session: manager }, payload: { label: 'P', password: 'StrongPass1!', pii: PII } })).json().id
    await app.inject({ method: 'POST', url: `/api/profiles/${id}/shares`, cookies: { nyx_session: manager }, payload: { email: 'ed@nyx.local' } })

    const res = await app.inject({ method: 'PUT', url: `/api/profiles/${id}/redirect-email`, cookies: { nyx_session: editor }, payload: { redirect_email: 'deleg@x.fr' } })
    expect(res.statusCode).toBe(200)
    const got = await app.inject({ method: 'GET', url: `/api/profiles/${id}`, cookies: { nyx_session: editor } })
    expect(got.json().redirect_email).toBe('deleg@x.fr')
  })

  it('cannot be set by a viewer (403)', async () => {
    const manager = await makeUser('mgr2@nyx.local', 'manager')
    const viewer  = await makeUser('vw@nyx.local', 'viewer')
    const id = (await app.inject({ method: 'POST', url: '/api/profiles', cookies: { nyx_session: manager }, payload: { label: 'P', password: 'StrongPass1!', pii: PII } })).json().id
    await app.inject({ method: 'POST', url: `/api/profiles/${id}/shares`, cookies: { nyx_session: manager }, payload: { email: 'vw@nyx.local' } })

    const res = await app.inject({ method: 'PUT', url: `/api/profiles/${id}/redirect-email`, cookies: { nyx_session: viewer }, payload: { redirect_email: 'x@x.fr' } })
    expect(res.statusCode).toBe(403)
  })

  it('accepts null to clear the redirect', async () => {
    const id = (await app.inject({ method: 'POST', url: '/api/profiles', cookies: { nyx_session: adminCookie }, payload: { label: 'P', password: 'StrongPass1!', pii: PII, redirect_email: 'a@a.fr' } })).json().id
    await app.inject({ method: 'PUT', url: `/api/profiles/${id}/redirect-email`, cookies: { nyx_session: adminCookie }, payload: { redirect_email: null } })
    const got = await app.inject({ method: 'GET', url: `/api/profiles/${id}`, cookies: { nyx_session: adminCookie } })
    expect(got.json().redirect_email).toBeNull()
  })

  it('rejects an invalid email', async () => {
    const id = (await app.inject({ method: 'POST', url: '/api/profiles', cookies: { nyx_session: adminCookie }, payload: { label: 'P', password: 'StrongPass1!', pii: PII } })).json().id
    const res = await app.inject({ method: 'PUT', url: `/api/profiles/${id}/redirect-email`, cookies: { nyx_session: adminCookie }, payload: { redirect_email: 'not-an-email' } })
    expect(res.statusCode).toBe(400)
  })
})
