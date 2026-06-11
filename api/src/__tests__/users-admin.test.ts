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

async function cookieFor(email: string, password = 'StrongPass1!'): Promise<string> {
  return (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } }))
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

async function listUsers() {
  return (await app.inject({ method: 'GET', url: '/api/users', cookies: { nyx_session: adminCookie } })).json() as { id: string; email: string; role: string }[]
}

describe('admin user management', () => {
  it('lists users without password hashes', async () => {
    await makeUser('u1@nyx.local', 'viewer')
    const res = await app.inject({ method: 'GET', url: '/api/users', cookies: { nyx_session: adminCookie } })
    expect(res.statusCode).toBe(200)
    const users = res.json()
    expect(users.length).toBe(2)
    expect(users[0]).not.toHaveProperty('password_hash')
  })

  it('non-admins cannot list users', async () => {
    const viewer = await makeUser('v@nyx.local', 'viewer')
    const res = await app.inject({ method: 'GET', url: '/api/users', cookies: { nyx_session: viewer } })
    expect(res.statusCode).toBe(403)
  })

  it('admin changes a user role', async () => {
    await makeUser('u2@nyx.local', 'viewer')
    const id = (await listUsers()).find(u => u.email === 'u2@nyx.local')!.id
    const res = await app.inject({ method: 'PATCH', url: `/api/users/${id}/role`, cookies: { nyx_session: adminCookie }, payload: { role: 'manager' } })
    expect(res.statusCode).toBe(200)
    expect((await listUsers()).find(u => u.email === 'u2@nyx.local')!.role).toBe('manager')
  })

  it('rejects an invalid role', async () => {
    await makeUser('u3@nyx.local', 'viewer')
    const id = (await listUsers()).find(u => u.email === 'u3@nyx.local')!.id
    const res = await app.inject({ method: 'PATCH', url: `/api/users/${id}/role`, cookies: { nyx_session: adminCookie }, payload: { role: 'superuser' } })
    expect(res.statusCode).toBe(400)
  })

  it('cannot demote the last admin', async () => {
    const id = (await listUsers()).find(u => u.email === 'admin@nyx.local')!.id
    const res = await app.inject({ method: 'PATCH', url: `/api/users/${id}/role`, cookies: { nyx_session: adminCookie }, payload: { role: 'manager' } })
    expect(res.statusCode).toBe(400)
  })

  it('admin deletes a user', async () => {
    await makeUser('u4@nyx.local', 'editor')
    const id = (await listUsers()).find(u => u.email === 'u4@nyx.local')!.id
    const res = await app.inject({ method: 'DELETE', url: `/api/users/${id}`, cookies: { nyx_session: adminCookie } })
    expect(res.statusCode).toBe(204)
    expect((await listUsers()).some(u => u.email === 'u4@nyx.local')).toBe(false)
  })

  it('cannot delete your own account', async () => {
    const id = (await listUsers()).find(u => u.email === 'admin@nyx.local')!.id
    const res = await app.inject({ method: 'DELETE', url: `/api/users/${id}`, cookies: { nyx_session: adminCookie } })
    expect(res.statusCode).toBe(400)
  })
})
