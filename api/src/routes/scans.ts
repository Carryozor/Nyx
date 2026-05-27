import type { FastifyInstance } from 'fastify'
import { v4 as uuid } from 'uuid'
import { getDb } from '../db/client.js'
import { config } from '../config.js'
import { verifyPassword } from '../crypto/argon.js'
import { deriveKey } from '../crypto/kdf.js'
import { encrypt } from '../crypto/aes.js'
import { requireAuth } from '../auth/middleware.js'
import type { UserRow, ProfileRow, ScanJobRow, BrokerRow } from '../types.js'

async function encryptKeyForWorker(piiKey: Buffer): Promise<string> {
  const workerKeyBuf = Buffer.from(config.WORKER_SECRET.padEnd(32, '0').slice(0, 32))
  const salt = Buffer.from(config.WORKER_SECRET).toString('hex').slice(0, 64).padEnd(64, '0')
  const blob = encrypt(piiKey.toString('hex'), workerKeyBuf, salt)
  return JSON.stringify(blob)
}

export function registerScanRoutes(app: FastifyInstance): void {

  app.post('/scans', { preHandler: requireAuth }, async (req, reply) => {
    const { profileId, password, brokerIds, email, aliasId } = req.body as {
      profileId:  string
      password:   string
      brokerIds?: string[]
      email?:     string
      aliasId?:   number | null
    }

    if (!profileId || !password) {
      return reply.code(400).send({ error: 'profileId and password required' })
    }

    if (brokerIds !== undefined && (!Array.isArray(brokerIds) || brokerIds.length > 100)) {
      return reply.code(400).send({ error: 'brokerIds must be an array of at most 100 items' })
    }

    const db = getDb()

    const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(profileId) as ProfileRow | undefined
    if (!profile) return reply.code(404).send({ error: 'Profile not found' })
    if (req.user.role !== 'admin' && profile.user_id !== req.user.id) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) as UserRow
    if (!(await verifyPassword(password, user.password_hash))) {
      return reply.code(401).send({ error: 'Wrong password' })
    }

    const piiBlob = JSON.parse(profile.encrypted_pii)
    const piiKey  = await deriveKey(password, piiBlob.salt)
    const encryptedJobKey = await encryptKeyForWorker(piiKey)

    const brokers: BrokerRow[] = brokerIds?.length
      ? db.prepare(`SELECT * FROM brokers WHERE id IN (${brokerIds.map(() => '?').join(',')}) AND active = 1`).all(...brokerIds) as BrokerRow[]
      : db.prepare("SELECT * FROM brokers WHERE active = 1 AND type IN ('auto','semi')").all() as BrokerRow[]

    const jobId      = uuid()
    const created_at = new Date().toISOString()

    db.prepare(
      'INSERT INTO scan_jobs (id, profile_id, broker_ids, status, encrypted_job_key, created_at, created_by, confirmation_email, simplelogin_alias_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      jobId, profileId,
      brokerIds ? JSON.stringify(brokerIds) : null,
      'queued',
      encryptedJobKey,
      created_at,
      req.user.id,
      email ?? null,
      aliasId ?? null,
    )

    const insertOpt = db.prepare(`
      INSERT OR IGNORE INTO opt_out_requests (id, profile_id, broker_id, status)
      VALUES (?, ?, ?, 'pending')
    `)
    for (const broker of brokers) {
      insertOpt.run(uuid(), profileId, broker.id)
    }

    return reply.code(201).send({
      id:           jobId,
      profile_id:   profileId,
      status:       'queued',
      broker_count: brokers.length,
      created_at,
    })
  })

  app.get('/scans/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()
    const job = db.prepare(
      'SELECT id, profile_id, broker_ids, status, confirmation_email, simplelogin_alias_id, created_at, started_at, finished_at, created_by FROM scan_jobs WHERE id = ?'
    ).get(id) as (Omit<ScanJobRow, 'encrypted_job_key'> & { confirmation_email: string | null; simplelogin_alias_id: number | null }) | undefined

    if (!job) return reply.code(404).send({ error: 'Not found' })

    const profile = db.prepare('SELECT user_id, label FROM profiles WHERE id = ?').get(job.profile_id) as { user_id: string; label: string }
    if (req.user.role !== 'admin' && profile.user_id !== req.user.id) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    // Include opt-out requests for this scan's brokers
    const brokerIds: string[] | null = job.broker_ids ? JSON.parse(job.broker_ids) : null
    const optOuts = brokerIds
      ? db.prepare(`
          SELECT oor.*, b.name as broker_name, b.type as broker_type, b.url as broker_url
          FROM opt_out_requests oor
          JOIN brokers b ON b.id = oor.broker_id
          WHERE oor.profile_id = ? AND oor.broker_id IN (${brokerIds.map(() => '?').join(',')})
          ORDER BY b.name
        `).all(job.profile_id, ...brokerIds)
      : db.prepare(`
          SELECT oor.*, b.name as broker_name, b.type as broker_type, b.url as broker_url
          FROM opt_out_requests oor
          JOIN brokers b ON b.id = oor.broker_id
          WHERE oor.profile_id = ?
          ORDER BY b.name
        `).all(job.profile_id)

    return reply.send({ ...job, profile_label: profile.label, opt_outs: optOuts })
  })

  app.get('/scans', { preHandler: requireAuth }, async (req, reply) => {
    const db = getDb()
    const base = req.user.role === 'admin'
      ? db.prepare('SELECT id, profile_id, status, created_at, started_at, finished_at FROM scan_jobs ORDER BY created_at DESC LIMIT 50').all() as ScanJobRow[]
      : db.prepare(`
          SELECT sj.id, sj.profile_id, sj.status, sj.created_at, sj.started_at, sj.finished_at
          FROM scan_jobs sj
          JOIN profiles p ON p.id = sj.profile_id
          WHERE p.user_id = ?
          ORDER BY sj.created_at DESC LIMIT 50
        `).all(req.user.id) as ScanJobRow[]

    const stats = db.prepare(`
      SELECT profile_id,
        count(*) as total,
        sum(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        sum(CASE WHEN status IN ('confirmed','already_removed') THEN 1 ELSE 0 END) as confirmed,
        sum(CASE WHEN status = 'awaiting_email' THEN 1 ELSE 0 END) as awaiting_email,
        sum(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) as submitted
      FROM opt_out_requests GROUP BY profile_id
    `).all() as { profile_id: string; total: number; failed: number; confirmed: number; awaiting_email: number; submitted: number }[]

    const statsMap = new Map(stats.map(s => [s.profile_id, s]))

    const jobs = base.map(j => ({
      ...j,
      stats: statsMap.get(j.profile_id) ?? null,
    }))

    return reply.send(jobs)
  })
}
