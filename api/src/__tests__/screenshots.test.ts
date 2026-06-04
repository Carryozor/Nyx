import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildApp } from '../app.js'
import { runMigrations } from '../db/migrate.js'
import { closeDb, getDb } from '../db/client.js'
import type { FastifyInstance } from 'fastify'

process.env.DB_PATH        = ':memory:'
process.env.JWT_SECRET     = 'a'.repeat(32)
process.env.WORKER_SECRET  = 'b'.repeat(32)
process.env.SCREENSHOT_DIR = '/tmp/nyx-test-screenshots'

// Create mock functions via vi.hoisted so they are available in vi.mock factory
const { mockExistsSync, mockReaddirSync, mockCreateReadStream } = vi.hoisted(() => ({
  mockExistsSync:       vi.fn(),
  mockReaddirSync:      vi.fn(),
  mockCreateReadStream: vi.fn(),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    default: {
      ...actual,
      existsSync:       mockExistsSync,
      readdirSync:      mockReaddirSync,
      createReadStream: mockCreateReadStream,
    },
    existsSync:       mockExistsSync,
    readdirSync:      mockReaddirSync,
    createReadStream: mockCreateReadStream,
  }
})

// Import real fs functions before the mock takes effect for use as defaults
import realFsModule from 'node:fs'

let app: FastifyInstance
let sessionCookie: string
let optOutId: string
let brokerId: string

// Store real fs function refs captured at module load time via importOriginal above
// We'll reset to real implementations using the actual module loaded prior to vi.mock
let _realExistsSync:       typeof realFsModule.existsSync
let _realReaddirSync:      typeof realFsModule.readdirSync
let _realCreateReadStream: typeof realFsModule.createReadStream

beforeEach(async () => {
  // Get original functions via importOriginal mechanism — use actual node fs
  const { existsSync, readdirSync, createReadStream } = await vi.importActual<typeof import('node:fs')>('node:fs')
  mockExistsSync.mockImplementation(existsSync)
  mockReaddirSync.mockImplementation(readdirSync)
  mockCreateReadStream.mockImplementation(createReadStream)

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
    payload: { label: 'Alice', password: 'StrongPass1!',
      pii: { firstName: 'Alice', lastName: 'D', dob: '1990-01-01',
             currentAddress: { street: '1 rue', city: 'Paris', country: 'FR' } } } })
  const profileId = pRes.json().id

  const db = getDb()
  const broker = db.prepare('SELECT id FROM brokers WHERE active = 1 LIMIT 1').get() as { id: string }
  brokerId = broker.id
  optOutId = 'oo-test-' + Date.now()
  db.prepare(
    'INSERT INTO opt_out_requests (id, profile_id, broker_id, status, screenshot) VALUES (?, ?, ?, ?, ?)'
  ).run(optOutId, profileId, brokerId, 'pending', 'job1')
})

afterEach(async () => { await app.close(); closeDb() })

describe('GET /api/opt-outs/:id/screenshots', () => {
  it('retourne la liste des PNG disponibles', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(['form-filled.png', 'submitted.png'] as any)

    const res = await app.inject({
      method: 'GET', url: `/api/opt-outs/${optOutId}/screenshots`,
      cookies: { nyx_session: sessionCookie },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveLength(2)
    expect(body[0].filename).toBe('form-filled.png')
    expect(body[0].url).toBe(`/api/opt-outs/${optOutId}/screenshot/form-filled.png`)
  })

  it('retourne [] si screenshot est NULL', async () => {
    const db = getDb()
    db.prepare('UPDATE opt_out_requests SET screenshot = NULL WHERE id = ?').run(optOutId)

    const res = await app.inject({
      method: 'GET', url: `/api/opt-outs/${optOutId}/screenshots`,
      cookies: { nyx_session: sessionCookie },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })

  it("retourne [] si le dossier n'existe pas", async () => {
    mockExistsSync.mockReturnValue(false)

    const res = await app.inject({
      method: 'GET', url: `/api/opt-outs/${optOutId}/screenshots`,
      cookies: { nyx_session: sessionCookie },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })

  it('retourne 404 si opt-out inexistant', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/opt-outs/nonexistent/screenshots',
      cookies: { nyx_session: sessionCookie },
    })
    expect(res.statusCode).toBe(404)
  })

  it('retourne 401 sans cookie', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/opt-outs/${optOutId}/screenshots`,
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /api/opt-outs/:id/screenshot/:filename', () => {
  it('retourne 400 si filename invalide (path traversal)', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/opt-outs/${optOutId}/screenshot/%2E%2E%2Fsecret.png`,
      cookies: { nyx_session: sessionCookie },
    })
    expect(res.statusCode).toBe(400)
  })

  it("retourne 404 si le fichier n'existe pas sur disque", async () => {
    mockExistsSync.mockReturnValue(false)

    const res = await app.inject({
      method: 'GET', url: `/api/opt-outs/${optOutId}/screenshot/form-filled.png`,
      cookies: { nyx_session: sessionCookie },
    })
    expect(res.statusCode).toBe(404)
  })

  it('sert le PNG avec Content-Type image/png', async () => {
    mockExistsSync.mockReturnValue(true)
    const { Readable } = await import('node:stream')
    mockCreateReadStream.mockReturnValue(Readable.from(Buffer.from('PNG')) as any)

    const res = await app.inject({
      method: 'GET', url: `/api/opt-outs/${optOutId}/screenshot/form-filled.png`,
      cookies: { nyx_session: sessionCookie },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('image/png')
  })
})
