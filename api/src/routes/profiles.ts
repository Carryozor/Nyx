import type { FastifyInstance } from 'fastify'
import { v4 as uuid } from 'uuid'
import { z } from 'zod'
import { getDb } from '../db/client.js'
import { verifyPassword } from '../crypto/argon.js'
import { deriveKey, generateSalt } from '../crypto/kdf.js'
import { encrypt, decrypt } from '../crypto/aes.js'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { requireProfileRead, requireProfileAction, requireOwnerOrAdmin, verifyProfileMasterPassword } from '../auth/access.js'
import type { UserRow, ProfileRow, ProfilePII } from '../types.js'

const AddressSchema = z.object({
  street:  z.string().min(1).max(200),
  city:    z.string().min(1).max(100),
  state:   z.string().max(50).optional(),
  zip:     z.string().max(20).optional(),
  country: z.string().length(2),
})

const CompanySchema = z.object({
  name:      z.string().min(1).max(200),
  siren:     z.string().regex(/^\d{9}$/, 'siren must be 9 digits').optional(),
  siret:     z.string().regex(/^\d{14}$/, 'siret must be 14 digits').optional(),
  legalForm: z.string().max(100).optional(),
})

const PiiSchema = z.object({
  firstName:         z.string().min(1).max(100),
  lastName:          z.string().min(1).max(100),
  dob:               z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dob must be YYYY-MM-DD'),
  email:             z.string().email().optional().or(z.literal('')),
  phone:             z.string().max(30).optional(),
  aliases:           z.array(z.string().max(100)).max(10).optional(),
  currentAddress:    AddressSchema,
  previousAddresses: z.array(AddressSchema).max(5).optional(),
  company:           CompanySchema.optional(),
})

export function registerProfileRoutes(app: FastifyInstance): void {

  app.get('/profiles', { preHandler: requireAuth }, async (req, reply) => {
    const db = getDb()
    const rows: ProfileRow[] = req.user.role === 'admin'
      ? db.prepare('SELECT p.id, p.user_id, p.label, p.created_at, p.redirect_email, u.email AS owner_email FROM profiles p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC').all() as ProfileRow[]
      : db.prepare(`
          SELECT DISTINCT p.id, p.user_id, p.label, p.created_at, p.redirect_email
          FROM profiles p
          LEFT JOIN profile_access pa ON pa.profile_id = p.id AND pa.user_id = ?
          WHERE p.user_id = ? OR pa.user_id IS NOT NULL
          ORDER BY p.created_at DESC
        `).all(req.user.id, req.user.id) as ProfileRow[]
    return reply.send(rows)
  })

  app.post('/profiles', { preHandler: requireRole('manager') }, async (req, reply) => {
    const { label, password, pii, redirect_email } = req.body as {
      label:    string
      password: string
      pii:      ProfilePII
      redirect_email?: string
    }
    if (redirect_email && !z.string().email().safeParse(redirect_email).success) {
      return reply.code(400).send({ error: 'redirect_email invalide' })
    }

    if (!label || !password || !pii) {
      return reply.code(400).send({ error: 'label, password and pii required' })
    }

    const piiParsed = PiiSchema.safeParse(pii)
    if (!piiParsed.success) {
      return reply.code(400).send({ error: 'Invalid PII', details: piiParsed.error.flatten().fieldErrors })
    }

    const db = getDb()
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) as UserRow
    if (!(await verifyPassword(password, user.password_hash))) {
      return reply.code(401).send({ error: 'Wrong password' })
    }

    const salt       = generateSalt()
    const key        = await deriveKey(password, salt)
    const blob       = encrypt(JSON.stringify(piiParsed.data), key, salt)
    const id         = uuid()
    const created_at = new Date().toISOString()

    db.prepare(
      'INSERT INTO profiles (id, user_id, label, encrypted_pii, created_at, redirect_email) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, req.user.id, label, JSON.stringify(blob), created_at, redirect_email ?? null)

    return reply.code(201).send({ id, user_id: req.user.id, label, created_at, redirect_email: redirect_email ?? null })
  })

  app.get('/profiles/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()
    const profile = db.prepare('SELECT id, user_id, label, created_at, redirect_email FROM profiles WHERE id = ?').get(id) as ProfileRow | undefined

    if (!profile) return reply.code(404).send({ error: 'Profile not found' })
    if (!requireProfileRead(db, req.user, id, reply)) return
    return reply.send(profile)
  })

  // Where broker replies are routed. Editable by editor+ (not viewer); not PII, so
  // no master password needed.
  app.put('/profiles/:id/redirect-email', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = z.object({ redirect_email: z.string().email().nullable() }).safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'redirect_email invalide (email ou null attendu)' })
    }
    const { redirect_email } = parsed.data

    const db = getDb()
    const profile = db.prepare('SELECT id FROM profiles WHERE id = ?').get(id)
    if (!profile) return reply.code(404).send({ error: 'Profile not found' })
    if (!requireProfileAction(db, req.user, id, reply)) return

    db.prepare('UPDATE profiles SET redirect_email = ? WHERE id = ?').run(redirect_email, id)
    return reply.send({ id, redirect_email })
  })

  app.post('/profiles/:id/decrypt', { preHandler: requireAuth, config: { rateLimit: { max: 15, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { password } = req.body as { password: string }

    if (!password) return reply.code(400).send({ error: 'password required' })

    const db = getDb()
    const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as ProfileRow | undefined
    if (!profile) return reply.code(404).send({ error: 'Profile not found' })
    if (!requireOwnerOrAdmin(db, req.user, id, reply)) return

    // Verify against the owner's master password (the PII is encrypted with it), so an
    // admin can decrypt another user's profile when given that password.
    if (!(await verifyProfileMasterPassword(db, id, password))) {
      return reply.code(401).send({ error: 'Wrong password' })
    }

    const blob = JSON.parse(profile.encrypted_pii)
    const key  = await deriveKey(password, blob.salt)

    let pii: ProfilePII
    try {
      pii = JSON.parse(decrypt(blob, key)) as ProfilePII
    } catch {
      return reply.code(500).send({ error: 'Decryption failed' })
    }

    return reply.send({ id, label: profile.label, pii })
  })

  app.patch('/profiles/:id', { preHandler: requireAuth, config: { rateLimit: { max: 15, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { label, password, pii } = req.body as { label?: string; password: string; pii?: ProfilePII }

    if (!password) return reply.code(400).send({ error: 'password required' })

    const db = getDb()
    const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as ProfileRow | undefined
    if (!profile) return reply.code(404).send({ error: 'Not found' })
    if (!requireOwnerOrAdmin(db, req.user, id, reply)) return

    if (!(await verifyProfileMasterPassword(db, id, password))) {
      return reply.code(401).send({ error: 'Wrong password' })
    }

    if (pii) {
      const piiParsed = PiiSchema.safeParse(pii)
      if (!piiParsed.success) {
        return reply.code(400).send({ error: 'Invalid PII', details: piiParsed.error.flatten().fieldErrors })
      }
      const salt = generateSalt()
      const key  = await deriveKey(password, salt)
      const blob = encrypt(JSON.stringify(piiParsed.data), key, salt)
      db.prepare('UPDATE profiles SET encrypted_pii = ?, label = COALESCE(?, label) WHERE id = ?')
        .run(JSON.stringify(blob), label ?? null, id)
    } else if (label) {
      db.prepare('UPDATE profiles SET label = ? WHERE id = ?').run(label, id)
    }

    const updated = db.prepare('SELECT id, user_id, label, created_at, redirect_email FROM profiles WHERE id = ?').get(id) as ProfileRow
    return reply.send(updated)
  })

  app.delete('/profiles/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()
    const profile = db.prepare('SELECT user_id FROM profiles WHERE id = ?').get(id) as { user_id: string } | undefined

    if (!profile) return reply.code(404).send({ error: 'Not found' })
    if (!requireOwnerOrAdmin(db, req.user, id, reply)) return

    db.prepare('DELETE FROM profiles WHERE id = ?').run(id)
    return reply.code(204).send()
  })
}
