import type { FastifyInstance } from 'fastify'
import { v4 as uuid } from 'uuid'
import { config } from '../config.js'
import { getDb } from '../db/client.js'
import { hashPassword, verifyPassword } from '../crypto/argon.js'
import { signToken } from './jwt.js'
import { requireAuth } from './middleware.js'
import type { UserRow, InvitationRow } from '../types.js'

export function registerAuthRoutes(app: FastifyInstance): void {

  app.get('/auth/setup', async (_req, reply) => {
    const db = getDb()
    const { n } = db.prepare('SELECT count(*) as n FROM users').get() as { n: number }
    return reply.send({ initialized: n > 0 })
  })

  app.post('/auth/register', async (req, reply) => {
    const { email, password, invitationToken } = req.body as {
      email: string
      password: string
      invitationToken?: string
    }

    if (!email || !password || password.length < 8) {
      return reply.code(400).send({ error: 'email and password (min 8 chars) required' })
    }

    const db = getDb()
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
    if (existing) return reply.code(409).send({ error: 'Email already registered' })

    const userCount = (db.prepare(
      "SELECT count(*) as n FROM users WHERE id != '00000000-0000-0000-0000-000000000000'"
    ).get() as { n: number }).n

    let role: 'admin' | 'user' = 'user'
    let invitedBy: string | null = null

    if (userCount === 0) {
      role = 'admin'
    } else {
      if (!invitationToken) {
        return reply.code(403).send({ error: 'Invitation required' })
      }
      // Atomically consume the invitation — returns 0 changes if already used/expired/wrong email
      const now = new Date().toISOString()
      const consumed = db.prepare(
        'UPDATE invitations SET used_at = ? WHERE token = ? AND used_at IS NULL AND expires_at > ? AND email = ?'
      ).run(now, invitationToken, now, email)

      if (consumed.changes === 0) {
        return reply.code(403).send({ error: 'Invalid, expired or already used invitation' })
      }

      const inv = db.prepare('SELECT created_by FROM invitations WHERE token = ?')
        .get(invitationToken) as { created_by: string } | undefined
      invitedBy = inv?.created_by ?? null
    }

    const id            = uuid()
    const password_hash = await hashPassword(password)
    const created_at    = new Date().toISOString()

    db.prepare(
      'INSERT INTO users (id, email, password_hash, role, created_at, invited_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, email, password_hash, role, created_at, invitedBy)

    return reply.code(201).send({ id, email, role, created_at })
  })

  app.post('/auth/login', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (req, reply) => {
    const { email, password } = req.body as { email: string; password: string }

    if (!email || !password) {
      return reply.code(400).send({ error: 'email and password required' })
    }

    const db   = getDb()
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const token = signToken({ id: user.id, email: user.email, role: user.role as 'admin' | 'user' })

    return reply
      .setCookie('nyx_session', token, {
        httpOnly: true,
        sameSite: 'strict',
        secure:   config.COOKIE_SECURE,
        path:     '/',
        maxAge:   8 * 3600,
      })
      .send({ id: user.id, email: user.email, role: user.role })
  })

  app.post('/auth/logout', async (_req, reply) => {
    return reply
      .clearCookie('nyx_session', { path: '/' })
      .send({ ok: true })
  })

  app.get('/auth/me', { preHandler: requireAuth }, async (req, reply) => {
    return reply.send({ id: req.user.id, email: req.user.email, role: req.user.role })
  })
}
