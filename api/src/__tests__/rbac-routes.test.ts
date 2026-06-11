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

const PII = {
  firstName: 'Alice', lastName: 'Dupont', dob: '1990-01-15',
  currentAddress: { street: '1 Rue de la Paix', city: 'Paris', country: 'FR' },
}

async function cookieFor(email: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'StrongPass1!' } })
  return res.cookies.find(c => c.name === 'nyx_session')!.value
}

/** Invite (as admin) + register a user with the given role; returns their session cookie. */
async function makeUser(email: string, role: string): Promise<string> {
  const inv = await app.inject({ method: 'POST', url: '/api/invitations', cookies: { nyx_session: adminCookie }, payload: { email, role } })
  const { token } = inv.json()
  await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password: 'StrongPass1!', invitationToken: token } })
  return cookieFor(email)
}

async function createProfile(cookie: string, label = 'P'): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/profiles', cookies: { nyx_session: cookie }, payload: { label, password: 'StrongPass1!', pii: PII } })
  return res.json().id
}

beforeEach(async () => {
  runMigrations()
  app = await buildApp()
  await app.ready()
  await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'admin@nyx.local', password: 'StrongPass1!' } })
  adminCookie = await cookieFor('admin@nyx.local')
})
afterEach(async () => { await app.close(); closeDb() })

describe('role gating for profile creation', () => {
  it('manager can create a profile', async () => {
    const manager = await makeUser('mgr@nyx.local', 'manager')
    const res = await app.inject({ method: 'POST', url: '/api/profiles', cookies: { nyx_session: manager }, payload: { label: 'P', password: 'StrongPass1!', pii: PII } })
    expect(res.statusCode).toBe(201)
  })

  it('manager can create MORE than one profile (1-profile limit removed)', async () => {
    const manager = await makeUser('mgr2@nyx.local', 'manager')
    await createProfile(manager, 'A')
    const res = await app.inject({ method: 'POST', url: '/api/profiles', cookies: { nyx_session: manager }, payload: { label: 'B', password: 'StrongPass1!', pii: PII } })
    expect(res.statusCode).toBe(201)
  })

  it('viewer and editor cannot create profiles', async () => {
    const viewer = await makeUser('v@nyx.local', 'viewer')
    const editor = await makeUser('e@nyx.local', 'editor')
    for (const c of [viewer, editor]) {
      const res = await app.inject({ method: 'POST', url: '/api/profiles', cookies: { nyx_session: c }, payload: { label: 'P', password: 'StrongPass1!', pii: PII } })
      expect(res.statusCode).toBe(403)
    }
  })
})

describe('profile sharing & access', () => {
  it('a shared viewer sees the profile; a non-shared user does not', async () => {
    const manager = await makeUser('owner@nyx.local', 'manager')
    const viewer  = await makeUser('viewer@nyx.local', 'viewer')
    const profileId = await createProfile(manager)

    // before sharing: viewer is denied
    expect((await app.inject({ method: 'GET', url: `/api/profiles/${profileId}`, cookies: { nyx_session: viewer } })).statusCode).toBe(403)

    // owner shares
    const share = await app.inject({ method: 'POST', url: `/api/profiles/${profileId}/shares`, cookies: { nyx_session: manager }, payload: { email: 'viewer@nyx.local' } })
    expect(share.statusCode).toBe(201)

    // after sharing: viewer can read and it appears in their list
    expect((await app.inject({ method: 'GET', url: `/api/profiles/${profileId}`, cookies: { nyx_session: viewer } })).statusCode).toBe(200)
    const list = (await app.inject({ method: 'GET', url: '/api/profiles', cookies: { nyx_session: viewer } })).json()
    expect(list.map((p: { id: string }) => p.id)).toContain(profileId)
  })

  it('editor shared on a profile can launch a scan; viewer cannot', async () => {
    const manager = await makeUser('o2@nyx.local', 'manager')
    const editor  = await makeUser('ed@nyx.local', 'editor')
    const viewer  = await makeUser('vw@nyx.local', 'viewer')
    const profileId = await createProfile(manager)
    await app.inject({ method: 'POST', url: `/api/profiles/${profileId}/shares`, cookies: { nyx_session: manager }, payload: { email: 'ed@nyx.local' } })
    await app.inject({ method: 'POST', url: `/api/profiles/${profileId}/shares`, cookies: { nyx_session: manager }, payload: { email: 'vw@nyx.local' } })

    // editor needs the owner's master password to scan (zero-knowledge); it is shared out-of-band.
    const editorScan = await app.inject({ method: 'POST', url: '/api/scans', cookies: { nyx_session: editor }, payload: { profileId, password: 'StrongPass1!' } })
    expect(editorScan.statusCode).toBe(201)

    const viewerScan = await app.inject({ method: 'POST', url: '/api/scans', cookies: { nyx_session: viewer }, payload: { profileId, password: 'StrongPass1!' } })
    expect(viewerScan.statusCode).toBe(403)
  })

  it('only the owner or an admin can share; an editor cannot', async () => {
    const manager = await makeUser('o3@nyx.local', 'manager')
    const editor  = await makeUser('ed3@nyx.local', 'editor')
    const viewer  = await makeUser('vw3@nyx.local', 'viewer')
    const profileId = await createProfile(manager)
    await app.inject({ method: 'POST', url: `/api/profiles/${profileId}/shares`, cookies: { nyx_session: manager }, payload: { email: 'ed3@nyx.local' } })

    // editor (has access) still cannot share
    const bad = await app.inject({ method: 'POST', url: `/api/profiles/${profileId}/shares`, cookies: { nyx_session: editor }, payload: { email: 'vw3@nyx.local' } })
    expect(bad.statusCode).toBe(403)

    // admin can share any profile
    const ok = await app.inject({ method: 'POST', url: `/api/profiles/${profileId}/shares`, cookies: { nyx_session: adminCookie }, payload: { email: 'vw3@nyx.local' } })
    expect(ok.statusCode).toBe(201)
  })

  it('cannot share with a manager (only viewer/editor are share targets)', async () => {
    const manager = await makeUser('o4@nyx.local', 'manager')
    await makeUser('mgrX@nyx.local', 'manager')
    const profileId = await createProfile(manager)
    const res = await app.inject({ method: 'POST', url: `/api/profiles/${profileId}/shares`, cookies: { nyx_session: manager }, payload: { email: 'mgrX@nyx.local' } })
    expect(res.statusCode).toBe(400)
  })

  it('revoking a share removes access', async () => {
    const manager = await makeUser('o5@nyx.local', 'manager')
    const viewer  = await makeUser('vw5@nyx.local', 'viewer')
    const profileId = await createProfile(manager)
    await app.inject({ method: 'POST', url: `/api/profiles/${profileId}/shares`, cookies: { nyx_session: manager }, payload: { email: 'vw5@nyx.local' } })

    const shares = (await app.inject({ method: 'GET', url: `/api/profiles/${profileId}/shares`, cookies: { nyx_session: manager } })).json() as { user_id: string }[]
    expect(shares).toHaveLength(1)
    const userId = shares[0].user_id

    const del = await app.inject({ method: 'DELETE', url: `/api/profiles/${profileId}/shares/${userId}`, cookies: { nyx_session: manager } })
    expect(del.statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url: `/api/profiles/${profileId}`, cookies: { nyx_session: viewer } })).statusCode).toBe(403)
  })

  it('a manager cannot edit a profile they do not own, even if (hypothetically) shared', async () => {
    const owner = await makeUser('owner6@nyx.local', 'manager')
    const other = await makeUser('other6@nyx.local', 'manager')
    const profileId = await createProfile(owner)
    // other manager has no access at all
    const res = await app.inject({ method: 'PATCH', url: `/api/profiles/${profileId}`, cookies: { nyx_session: other }, payload: { password: 'StrongPass1!', label: 'X' } })
    expect(res.statusCode).toBe(403)
  })
})
