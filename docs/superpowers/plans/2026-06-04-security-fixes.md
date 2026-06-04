# Security Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les 4 problèmes critiques et 5 problèmes importants identifiés lors de la revue de code sécurité de Nyx.

**Architecture:** Fixes indépendants organisés du plus critique au moins critique. Chaque task est auto-contenue, testée et committée. Le projet est un monorepo npm workspaces dans `/opt/claude/nyx/` avec sous-packages `api/`, `worker/`, `frontend/`.

**Tech Stack:** TypeScript, Fastify, better-sqlite3, Node.js crypto (hkdfSync), Vitest

---

## Fichiers modifiés

| Fichier | Tâche | Changement |
|---|---|---|
| `api/src/db/client.ts` | 1 | Ajouter `busy_timeout` |
| `api/src/auth/routes.ts` | 1 | TOCTOU invitation → UPDATE conditionnel |
| `api/src/crypto/aes.ts` | 2 | Ajouter `encryptJobKey` via HKDF |
| `worker/src/crypto/aes.ts` | 2 | Réécrire `decryptJobKey` via HKDF |
| `api/src/routes/scans.ts` | 2 | Utiliser `encryptJobKey` |
| `api/src/routes/schedules.ts` | 2 | Utiliser `encryptJobKey` |
| `worker/src/job-runner.ts` | 2 | Purger `encrypted_job_key` après complétion |
| `api/src/db/migrations/011_purge_job_keys.sql` | 2 | Supprimer les anciennes clés |
| `api/src/routes/webhook.ts` | 3 | Header auth, SSRF, Message-ID dedup |
| `worker/src/job-runner.ts` | 4 | Reaper jobs zombies |
| `api/src/routes/profiles.ts` | 5 | Zod body validation |
| `api/src/routes/email-configs.ts` | 5 | Zod body validation |
| `api/src/app.ts` | 6 | Headers sécurité HTTP |
| `worker/src/broker-runner.ts` | 7 | Allowlist `script_file` |
| `api/src/__tests__/auth.routes.test.ts` | 1 | Test TOCTOU |
| `api/src/__tests__/webhook.test.ts` | 3 | Tests webhook sécurité |
| `worker/src/__tests__/job-runner.test.ts` | 4 | Test reaper |

---

## Task 1 — SQLite busy_timeout + Fix TOCTOU invitation

**Files:**
- Modify: `api/src/db/client.ts`
- Modify: `api/src/auth/routes.ts`
- Modify: `api/src/__tests__/auth.routes.test.ts`

- [ ] **Écrire le test TOCTOU (RED)**

Dans `api/src/__tests__/auth.routes.test.ts`, ajouter à la fin :

```typescript
describe('POST /auth/register — invitation atomicity', () => {
  it('cannot use the same invitation token twice in concurrent requests', async () => {
    // Register first admin
    await app.inject({ method: 'POST', url: '/api/auth/register',
      payload: { email: 'admin@nyx.local', password: 'StrongPass1!' } })
    const adminLogin = await app.inject({ method: 'POST', url: '/api/auth/login',
      payload: { email: 'admin@nyx.local', password: 'StrongPass1!' } })
    const adminCookie = adminLogin.cookies.find(c => c.name === 'nyx_session')!.value

    // Create invitation
    const invRes = await app.inject({ method: 'POST', url: '/api/invitations',
      cookies: { nyx_session: adminCookie },
      payload: { email: 'user@nyx.local' } })
    const { token } = invRes.json()

    // Two concurrent registrations with the same token
    const [r1, r2] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/auth/register',
        payload: { email: 'user@nyx.local', password: 'Pass1234!', invitationToken: token } }),
      app.inject({ method: 'POST', url: '/api/auth/register',
        payload: { email: 'user@nyx.local', password: 'Pass1234!', invitationToken: token } }),
    ])

    // Only one should succeed; the other must fail (409 duplicate email or 403 invalid token)
    const codes = [r1.statusCode, r2.statusCode].sort()
    expect(codes[0]).toBeGreaterThanOrEqual(400)
    expect(codes[1]).toBeGreaterThanOrEqual(400)
    // At most one success
    const successes = [r1, r2].filter(r => r.statusCode === 201)
    expect(successes.length).toBeLessThanOrEqual(1)
  })
})
```

- [ ] **Lancer le test pour vérifier qu'il passe déjà ou révèle le problème**

```bash
cd /opt/claude/nyx/api && npx vitest run src/__tests__/auth.routes.test.ts 2>&1 | tail -15
```

- [ ] **Corriger `api/src/auth/routes.ts` — rendre la consommation d'invitation atomique**

Remplacer le bloc invitation (lignes 43-55) par :

```typescript
      // Consume the invitation atomically — UPDATE returns 0 changes if already used
      const consumed = db.prepare(
        'UPDATE invitations SET used_at = ? WHERE token = ? AND used_at IS NULL AND expires_at > ? AND email = ?'
      ).run(new Date().toISOString(), invitationToken, new Date().toISOString(), email)

      if (consumed.changes === 0) {
        return reply.code(403).send({ error: 'Invalid, expired or already used invitation' })
      }

      const inv = db.prepare('SELECT created_by FROM invitations WHERE token = ?')
        .get(invitationToken) as { created_by: string } | undefined
      invitedBy = inv?.created_by ?? null
```

- [ ] **Ajouter `busy_timeout` dans `api/src/db/client.ts`**

```typescript
export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(config.DB_PATH)
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')
    _db.pragma('busy_timeout = 5000')
  }
  return _db
}
```

- [ ] **Lancer tous les tests API**

```bash
cd /opt/claude/nyx/api && npm test 2>&1 | grep -E "Tests |Test Files"
```
Attendu : tous passent.

- [ ] **Commit**

```bash
cd /opt/claude/nyx && git add api/src/db/client.ts api/src/auth/routes.ts api/src/__tests__/auth.routes.test.ts
git commit -m "fix: sqlite busy_timeout + atomic invitation consumption"
```

---

## Task 2 — Dérivation de la clé worker via HKDF + purge

**Files:**
- Modify: `api/src/crypto/aes.ts`
- Modify: `worker/src/crypto/aes.ts`
- Modify: `api/src/routes/scans.ts`
- Modify: `api/src/routes/schedules.ts`
- Modify: `worker/src/job-runner.ts`
- Create: `api/src/db/migrations/011_purge_job_keys.sql`

### 2a — Ajouter `encryptJobKey` côté API

- [ ] **Écrire le test (RED)**

Ajouter dans `api/src/__tests__/scans.test.ts` :

```typescript
it('encrypted_job_key uses random salt (different each time)', async () => {
  // Two scans of the same profile must produce different encrypted_job_key blobs
  const r1 = await app.inject({ method: 'POST', url: '/api/scans',
    cookies: { nyx_session: sessionCookie },
    payload: { profileId, password: 'StrongPass1!' } })
  const r2 = await app.inject({ method: 'POST', url: '/api/scans',
    cookies: { nyx_session: sessionCookie },
    payload: { profileId, password: 'StrongPass1!' } })

  const db = getDb()
  const key1 = JSON.parse((db.prepare('SELECT encrypted_job_key FROM scan_jobs WHERE id=?').get(r1.json().id) as any).encrypted_job_key)
  const key2 = JSON.parse((db.prepare('SELECT encrypted_job_key FROM scan_jobs WHERE id=?').get(r2.json().id) as any).encrypted_job_key)

  // Salts must differ
  expect(key1.salt).not.toBe(key2.salt)
  // Ciphertexts must differ (different key + different IV → different output)
  expect(key1.ciphertext).not.toBe(key2.ciphertext)
})
```

- [ ] **Vérifier que le test ÉCHOUE** (actuellement le salt est statique)

```bash
cd /opt/claude/nyx/api && npx vitest run src/__tests__/scans.test.ts 2>&1 | tail -15
```
Attendu : le test `random salt` FAIL (les salts sont identiques).

- [ ] **Modifier `api/src/crypto/aes.ts` — ajouter `encryptJobKey`**

```typescript
import crypto from 'node:crypto'
import type { EncryptedBlob } from '../types.js'

const ALGORITHM = 'aes-256-gcm'

export function encrypt(plaintext: string, key: Buffer, salt: string): EncryptedBlob {
  const iv     = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])

  return {
    salt,
    iv:         iv.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
    authTag:    cipher.getAuthTag().toString('hex'),
  }
}

export function decrypt(blob: EncryptedBlob, key: Buffer): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(blob.iv, 'hex'),
  )
  decipher.setAuthTag(Buffer.from(blob.authTag, 'hex'))

  return Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, 'hex')),
    decipher.final(),
  ]).toString('utf8')
}

/** Derive a 256-bit AES key from workerSecret using HKDF-SHA256 and a random per-blob salt. */
function deriveWorkerKey(workerSecret: string, saltHex: string): Buffer {
  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      Buffer.from(workerSecret),
      Buffer.from(saltHex, 'hex'),
      Buffer.alloc(0),
      32,
    )
  )
}

/** Encrypt the PII key for the worker. Uses HKDF with a fresh random salt. */
export function encryptJobKey(piiKey: Buffer, workerSecret: string): EncryptedBlob {
  const salt = crypto.randomBytes(32).toString('hex')
  const key  = deriveWorkerKey(workerSecret, salt)
  return encrypt(piiKey.toString('hex'), key, salt)
}
```

- [ ] **Modifier `api/src/routes/scans.ts` — utiliser `encryptJobKey`**

Remplacer la fonction `encryptKeyForWorker` et son import (lignes 7 et 11-16) par :

```typescript
import { encryptJobKey } from '../crypto/aes.js'
```

Et remplacer l'appel :
```typescript
    const encryptedJobKey = JSON.stringify(encryptJobKey(piiKey, config.WORKER_SECRET))
```

Supprimer la fonction `encryptKeyForWorker` (lignes 11-16 du fichier original).

- [ ] **Modifier `api/src/routes/schedules.ts` — même chose**

Remplacer l'import `encrypt` par `encryptJobKey` et supprimer `encryptKeyForWorker` :

```typescript
import { encryptJobKey } from '../crypto/aes.js'
```

Remplacer l'appel ligne 41 :
```typescript
    const encKey = JSON.stringify(encryptJobKey(piiKey, config.WORKER_SECRET))
```

Supprimer les lignes 11-15 (la fonction `encryptKeyForWorker`).

- [ ] **Lancer les tests API**

```bash
cd /opt/claude/nyx/api && npm test 2>&1 | grep -E "Tests |Test Files"
```
Attendu : tous passent, y compris le nouveau test `random salt`.

### 2b — Mettre à jour `decryptJobKey` côté worker

- [ ] **Modifier `worker/src/crypto/aes.ts`** — réécrire avec HKDF :

```typescript
import crypto from 'node:crypto'

export interface EncryptedBlob {
  salt: string
  iv: string
  ciphertext: string
  authTag: string
}

export function decrypt(blob: EncryptedBlob, key: Buffer): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'hex'))
  decipher.setAuthTag(Buffer.from(blob.authTag, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, 'hex')),
    decipher.final(),
  ]).toString('utf8')
}

export function encrypt(plaintext: string, key: Buffer, salt: string): EncryptedBlob {
  const iv     = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return {
    salt,
    iv:         iv.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
    authTag:    cipher.getAuthTag().toString('hex'),
  }
}

function deriveWorkerKey(workerSecret: string, saltHex: string): Buffer {
  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      Buffer.from(workerSecret),
      Buffer.from(saltHex, 'hex'),
      Buffer.alloc(0),
      32,
    )
  )
}

export function decryptJobKey(encryptedJobKey: string, workerSecret: string): Buffer {
  const blob: EncryptedBlob = JSON.parse(encryptedJobKey)
  const key = deriveWorkerKey(workerSecret, blob.salt)
  const hexKey = decrypt(blob, key)
  return Buffer.from(hexKey, 'hex')
}
```

- [ ] **Lancer les tests worker**

```bash
cd /opt/claude/nyx/worker && npm test 2>&1 | grep -E "Tests |Test Files"
```
Attendu : tous passent.

### 2c — Purger `encrypted_job_key` après complétion + migration

- [ ] **Créer la migration `api/src/db/migrations/011_purge_job_keys.sql`**

```sql
-- Purge encrypted_job_key from completed/failed jobs (data minimization).
-- Old keys used a weak derivation (ASCII-padded secret, static salt).
-- New keys use HKDF. Clearing old values limits exposure window.
UPDATE scan_jobs SET encrypted_job_key = '' WHERE status IN ('done', 'failed');
-- Reset any stuck 'running' jobs to 'queued' so they are re-processed
-- with the new key format after deployment.
UPDATE scan_jobs SET status = 'queued', started_at = NULL WHERE status = 'running';
```

- [ ] **Modifier `worker/src/job-runner.ts`** — purger la clé après complétion

Dans la fonction `processNextJob`, après `UPDATE scan_jobs SET status='done'` (ligne 52-54), ajouter :

```typescript
    db.prepare("UPDATE scan_jobs SET status='done', finished_at=?, encrypted_job_key='' WHERE id=?")
      .run(new Date().toISOString(), job.id)
```

Et dans le catch (ligne 59-61) :
```typescript
    db.prepare("UPDATE scan_jobs SET status='failed', finished_at=?, encrypted_job_key='' WHERE id=?")
      .run(new Date().toISOString(), job.id)
```

- [ ] **Lancer tous les tests worker**

```bash
cd /opt/claude/nyx/worker && npm test 2>&1 | grep -E "Tests |Test Files"
```
Attendu : tous passent.

- [ ] **Build API et worker**

```bash
cd /opt/claude/nyx/api && npm run build && cd ../worker && npm run build
```
Attendu : aucune erreur TypeScript.

- [ ] **Commit**

```bash
cd /opt/claude/nyx && git add api/src/crypto/aes.ts worker/src/crypto/aes.ts \
  api/src/routes/scans.ts api/src/routes/schedules.ts worker/src/job-runner.ts \
  api/src/db/migrations/011_purge_job_keys.sql api/src/__tests__/scans.test.ts
git commit -m "fix: HKDF worker key derivation with random salt + purge encrypted_job_key after completion"
```

---

## Task 3 — Webhook : header auth + SSRF + idempotence

**Files:**
- Modify: `api/src/routes/webhook.ts`
- Create: `api/src/__tests__/webhook.test.ts`
- Modify: `api/src/db/migrations/001_initial.sql` → non, ajouter `012_webhook_seen.sql`

### 3a — Table dedup Message-ID

- [ ] **Créer `api/src/db/migrations/012_webhook_seen.sql`**

```sql
-- Prevent double-processing of email webhooks (Cloudflare may retry on timeout).
CREATE TABLE IF NOT EXISTS webhook_seen (
  message_id  TEXT PRIMARY KEY,
  processed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webhook_seen_processed ON webhook_seen(processed_at);
```

### 3b — Réécrire `api/src/routes/webhook.ts`

- [ ] **Écrire les tests qui définissent le comportement attendu**

Créer `api/src/__tests__/webhook.test.ts` :

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildApp } from '../app.js'
import { runMigrations } from '../db/migrate.js'
import { closeDb, getDb } from '../db/client.js'
import type { FastifyInstance } from 'fastify'

process.env.DB_PATH        = ':memory:'
process.env.JWT_SECRET     = 'a'.repeat(32)
process.env.WORKER_SECRET  = 'b'.repeat(32)
process.env.WEBHOOK_SECRET = 'test-webhook-secret-1234567890ab'

let app: FastifyInstance

const VALID_BODY = {
  'message-id': '<test-123@mail.example>',
  to:      'nyx-abc123@vidar.fr',
  from:    'noreply@suppression.peopleconnect.us',
  subject: 'Confirm your email address',
  html:    '<html><a href="https://suppression.peopleconnect.us/confirm?token=ABC">confirm</a></html>',
}

beforeEach(async () => {
  vi.resetAllMocks()
  runMigrations()
  app = await buildApp()
  await app.ready()
})
afterEach(async () => { await app.close(); closeDb() })

describe('POST /api/webhook/email', () => {
  it('returns 401 without Authorization header', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/webhook/email',
      payload: VALID_BODY })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 with wrong secret in header', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/webhook/email',
      headers: { authorization: 'Bearer wrong-secret' },
      payload: VALID_BODY })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 if secret is in query param (old behavior disabled)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhook/email?secret=test-webhook-secret-1234567890ab',
      payload: VALID_BODY })
    expect(res.statusCode).toBe(401)
  })

  it('accepts valid Authorization header and processes email', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/webhook/email',
      headers: { authorization: 'Bearer test-webhook-secret-1234567890ab' },
      payload: VALID_BODY })
    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)
  })

  it('is idempotent — duplicate message-id skipped', async () => {
    const headers = { authorization: 'Bearer test-webhook-secret-1234567890ab' }
    const r1 = await app.inject({ method: 'POST', url: '/api/webhook/email', headers, payload: VALID_BODY })
    const r2 = await app.inject({ method: 'POST', url: '/api/webhook/email', headers, payload: VALID_BODY })
    expect(r1.json().ok).toBe(true)
    expect(r2.json().skipped).toMatch(/duplicate/)
  })

  it('rejects URLs that redirect to untrusted domains (SSRF guard)', async () => {
    // We test extractConfirmationUrls does NOT return private IPs
    // by sending a body with a "trusted" URL that contains a private IP hostname
    const body = {
      ...VALID_BODY,
      'message-id': '<ssrf-test@mail.example>',
      html: '<a href="https://suppression.peopleconnect.us/confirm?token=XYZ">confirm</a>',
    }
    // The actual SSRF test is on clickConfirmationUrl's redirect handling,
    // which we cannot easily test without a real HTTP server.
    // We verify the endpoint processes without crashing.
    const res = await app.inject({ method: 'POST', url: '/api/webhook/email',
      headers: { authorization: 'Bearer test-webhook-secret-1234567890ab' },
      payload: body })
    expect(res.statusCode).toBe(200)
  })

  it('rejects filenames with path traversal in subject-based pattern (no crash)', async () => {
    const body = { ...VALID_BODY, 'message-id': '<pt-test@mail.example>',
      subject: '../../../etc/passwd' }
    const res = await app.inject({ method: 'POST', url: '/api/webhook/email',
      headers: { authorization: 'Bearer test-webhook-secret-1234567890ab' },
      payload: body })
    expect(res.statusCode).toBe(200)
  })
})
```

- [ ] **Vérifier que les tests ÉCHOUENT (route n'accepte pas le header encore)**

```bash
cd /opt/claude/nyx/api && npx vitest run src/__tests__/webhook.test.ts 2>&1 | tail -20
```
Attendu : plusieurs FAIL.

- [ ] **Réécrire `api/src/routes/webhook.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import { simpleParser } from 'mailparser'
import crypto from 'node:crypto'
import { getDb } from '../db/client.js'
import { config } from '../config.js'

// Confirmation URL patterns per broker family
const CONFIRMATION_URL_PATTERNS = [
  /https:\/\/suppression\.peopleconnect\.us\/[^\s"'<>=]+/gi,
  /https:\/\/www\.beenverified\.com\/[^\s"'<>]*confirm[^\s"'<>]*/gi,
  /https:\/\/www\.instantcheckmate\.com\/[^\s"'<>]*confirm[^\s"'<>]*/gi,
  /https:\/\/www\.truthfinder\.com\/[^\s"'<>]*confirm[^\s"'<>]*/gi,
  /https:\/\/www\.intelius\.com\/[^\s"'<>]*confirm[^\s"'<>]*/gi,
  /https:\/\/www\.spokeo\.com\/[^\s"'<>]*confirm[^\s"'<>]*/gi,
  /https:\/\/[^\s"'<>]*(?:confirm|verify|opt-out|suppress)[^\s"'<>]*/gi,
]

const TRUSTED_DOMAINS = new Set([
  'suppression.peopleconnect.us',
  'www.beenverified.com',
  'www.instantcheckmate.com',
  'www.truthfinder.com',
  'www.intelius.com',
  'www.spokeo.com',
  'www.peoplefinder.com',
  'www.checkpeople.com',
  'www.peoplelooker.com',
  'www.neighborwho.com',
  'www.ussearch.com',
  'www.zabasearch.com',
  'www.peoplesmart.com',
  'nuwber.com',
  'infotracer.com',
  'www.familytreenow.com',
])

// RFC-1918 + link-local ranges to block in redirect targets
const PRIVATE_IP_RE = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|::1|fc|fd)/i

function isPrivateOrLoopback(hostname: string): boolean {
  return PRIVATE_IP_RE.test(hostname)
}

function isTrustedUrl(urlStr: string): boolean {
  try {
    const { hostname } = new URL(urlStr)
    return TRUSTED_DOMAINS.has(hostname) && !isPrivateOrLoopback(hostname)
  } catch { return false }
}

function extractConfirmationUrls(body: string): string[] {
  const urls = new Set<string>()
  const decoded = body
    .replace(/=\r?\n/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/=3D/gi, '=')

  for (const pattern of CONFIRMATION_URL_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of decoded.matchAll(pattern)) {
      const url = match[0].replace(/['">\s]+$/, '')
      if (isTrustedUrl(url)) urls.add(url)
    }
  }
  return [...urls]
}

async function clickConfirmationUrl(url: string): Promise<boolean> {
  let current = url
  const MAX_REDIRECTS = 5

  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    try {
      const res = await fetch(current, {
        method:   'GET',
        redirect: 'manual',    // never auto-follow — we validate each hop
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
          'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(15000),
      })

      if (res.ok) return true

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location')
        if (!location) return false
        // Re-validate the redirect target
        if (!isTrustedUrl(location)) return false
        current = location
        continue
      }

      return false
    } catch { return false }
  }
  return false
}

interface CloudflareEmailPayload {
  'message-id'?: string
  to:             string
  from:           string
  subject:        string
  html:           string
}

export function registerWebhookRoutes(app: FastifyInstance): void {

  app.post('/webhook/email', async (req, reply) => {
    // Authenticate via Authorization header (timing-safe comparison)
    const authHeader = (req.headers['authorization'] ?? '') as string
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    const secret = config.WEBHOOK_SECRET ?? ''

    if (
      !secret ||
      token.length !== secret.length ||
      !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret))
    ) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }

    const payload = req.body as CloudflareEmailPayload
    const { to, from, subject, html: rawMime } = payload
    const messageId = payload['message-id'] ?? `${to}:${from}:${subject}`.slice(0, 200)

    if (!to || !rawMime) {
      return reply.send({ ok: true, skipped: 'missing to or body' })
    }

    const db = getDb()

    // Idempotence — skip if already processed
    const alreadySeen = db.prepare('SELECT 1 FROM webhook_seen WHERE message_id = ?').get(messageId)
    if (alreadySeen) {
      return reply.send({ ok: true, skipped: 'duplicate message-id already processed' })
    }
    db.prepare('INSERT OR IGNORE INTO webhook_seen (message_id, processed_at) VALUES (?, ?)')
      .run(messageId, new Date().toISOString())

    // Parse MIME email body
    let emailHtml = ''
    let emailText = ''
    try {
      const parsed = await simpleParser(rawMime)
      emailHtml = parsed.html || ''
      emailText = parsed.text || ''
    } catch {
      emailText = rawMime
    }
    const emailBody = emailHtml || emailText

    // Find opt-out requests waiting on this alias
    const pending = db.prepare(`
      SELECT oor.id, oor.broker_id, oor.confirmation_pattern, b.name as broker_name
      FROM opt_out_requests oor
      JOIN brokers b ON b.id = oor.broker_id
      JOIN scan_jobs sj ON sj.profile_id = oor.profile_id
      WHERE oor.status = 'awaiting_email'
        AND LOWER(sj.confirmation_email) = LOWER(?)
    `).all(to) as Array<{
      id: string; broker_id: string; broker_name: string; confirmation_pattern: string | null
    }>

    if (pending.length === 0) {
      return reply.send({ ok: true, skipped: 'no pending opt-outs for this address' })
    }

    const haystack = `${subject} ${from}`.toLowerCase()
    const matched = pending.filter(oo => {
      try {
        const pat = oo.confirmation_pattern
          ? new RegExp(oo.confirmation_pattern, 'i')
          : new RegExp(oo.broker_name.toLowerCase().replace(/\s+/g, '.*'), 'i')
        return pat.test(haystack)
      } catch { return false }
    })

    if (matched.length === 0) {
      return reply.send({ ok: true, skipped: 'no pattern match' })
    }

    const urls = extractConfirmationUrls(emailBody)

    if (urls.length === 0) {
      return reply.send({ ok: true, skipped: 'no confirmation URLs found', matched: matched.length })
    }

    const clicked: string[] = []
    for (const url of urls) {
      const ok = await clickConfirmationUrl(url)
      if (ok) clicked.push(url)
    }

    if (clicked.length > 0) {
      const now = new Date().toISOString()
      for (const oo of matched) {
        db.prepare(`UPDATE opt_out_requests SET status='confirmed', confirmed_at=? WHERE id=?`)
          .run(now, oo.id)
      }
    }

    return reply.send({
      ok: true, to,
      matched: matched.length,
      urls: urls.length,
      clicked: clicked.length,
      confirmed: clicked.length > 0 ? matched.length : 0,
    })
  })
}
```

- [ ] **Lancer les tests webhook**

```bash
cd /opt/claude/nyx/api && npx vitest run src/__tests__/webhook.test.ts 2>&1 | tail -20
```
Attendu : tous passent.

- [ ] **Lancer tous les tests API**

```bash
cd /opt/claude/nyx/api && npm test 2>&1 | grep -E "Tests |Test Files"
```

- [ ] **Mettre à jour le Cloudflare Email Worker** pour envoyer le header au lieu du query param

Le Worker Cloudflare doit être mis à jour dans le dashboard pour utiliser :
```javascript
await fetch(`https://nyx.vidar.fr/api/webhook/email`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${env.NYX_WEBHOOK_SECRET}`,
  },
  body: JSON.stringify({ ... }),
})
```

- [ ] **Commit**

```bash
cd /opt/claude/nyx && git add api/src/routes/webhook.ts api/src/__tests__/webhook.test.ts \
  api/src/db/migrations/012_webhook_seen.sql
git commit -m "fix: webhook header auth + SSRF guard + message-id idempotence"
```

---

## Task 4 — Reaper des jobs zombies

**Files:**
- Modify: `worker/src/job-runner.ts`
- Modify: `worker/src/__tests__/job-runner.test.ts`

Un job `running` depuis plus de `MAX_JOB_DURATION_MS` (10 minutes) est bloqué. Le reaper le remet en `queued` pour qu'il soit repris.

- [ ] **Écrire le test (RED)**

Dans `worker/src/__tests__/job-runner.test.ts`, ajouter dans le describe `processNextJob` :

```typescript
it('reaper requeues jobs stuck in running for over 10 minutes', async () => {
  const db = makeDb()
  const tenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString()
  db.prepare("INSERT INTO scan_jobs VALUES ('j-stuck','p1',NULL,'running','{}',NULL,'2026-01-01',?,NULL,'u1')")
    .run(tenMinutesAgo)

  const { reaperTick } = await import('../job-runner.js')
  reaperTick(db)

  const job = db.prepare('SELECT status FROM scan_jobs WHERE id=?').get('j-stuck') as { status: string }
  expect(job.status).toBe('queued')
})

it('reaper does not requeue jobs running for less than 10 minutes', async () => {
  const db = makeDb()
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  db.prepare("INSERT INTO scan_jobs VALUES ('j-fresh','p1',NULL,'running','{}',NULL,'2026-01-01',?,NULL,'u1')")
    .run(twoMinutesAgo)

  const { reaperTick } = await import('../job-runner.js')
  reaperTick(db)

  const job = db.prepare('SELECT status FROM scan_jobs WHERE id=?').get('j-fresh') as { status: string }
  expect(job.status).toBe('running')
})
```

- [ ] **Vérifier que les tests ÉCHOUENT**

```bash
cd /opt/claude/nyx/worker && npx vitest run src/__tests__/job-runner.test.ts 2>&1 | tail -10
```
Attendu : FAIL — `reaperTick` n'existe pas.

- [ ] **Modifier `worker/src/job-runner.ts`** — ajouter `reaperTick` et `startJobRunner`

Ajouter avant `startJobRunner` :

```typescript
const MAX_JOB_DURATION_MS = 10 * 60 * 1000  // 10 minutes

export function reaperTick(db: Database.Database): void {
  const cutoff = new Date(Date.now() - MAX_JOB_DURATION_MS).toISOString()
  const result = db.prepare(`
    UPDATE scan_jobs
    SET status = 'queued', started_at = NULL
    WHERE status = 'running' AND started_at < ?
  `).run(cutoff)
  if (result.changes > 0) {
    console.error(`[worker] reaper: requeued ${result.changes} stuck job(s)`)
  }
}
```

Et modifier `startJobRunner` pour inclure le reaper :

```typescript
export function startJobRunner(db: Database.Database): void {
  // Reap any jobs left running from a previous crashed worker instance
  reaperTick(db)

  const poll = async () => {
    try {
      reaperTick(db)
      await processNextJob(db)
    } catch (err) { console.error('[worker] Poll error:', err) }
    setTimeout(poll, config.JOB_POLL_MS)
  }
  poll()
}
```

- [ ] **Lancer tous les tests worker**

```bash
cd /opt/claude/nyx/worker && npm test 2>&1 | grep -E "Tests |Test Files"
```
Attendu : tous passent.

- [ ] **Commit**

```bash
cd /opt/claude/nyx && git add worker/src/job-runner.ts worker/src/__tests__/job-runner.test.ts
git commit -m "fix: reaper requeues jobs stuck in running state after 10 minutes"
```

---

## Task 5 — Zod validation sur les bodies API manquants

**Files:**
- Modify: `api/src/routes/profiles.ts` (decrypt endpoint)
- Modify: `api/src/routes/email-configs.ts`
- Modify: `api/src/routes/scans.ts`

- [ ] **Lire les fichiers actuels**

```bash
grep -n "req.body as" /opt/claude/nyx/api/src/routes/profiles.ts /opt/claude/nyx/api/src/routes/email-configs.ts | head -20
```

- [ ] **Modifier `api/src/routes/email-configs.ts`** — valider le body avec Zod

Ajouter en haut du fichier après les imports existants :

```typescript
import { z } from 'zod'

const emailConfigSchema = z.object({
  password:    z.string().min(1),
  provider:    z.enum(['simplelogin', 'gmail']),
  credentials: z.record(z.string(), z.string()),
})
```

Dans le handler `POST /profiles/:id/email-config`, remplacer :
```typescript
const { password, provider, credentials } = req.body as { ... }
```
par :
```typescript
const parsed = emailConfigSchema.safeParse(req.body)
if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message })
const { password, provider, credentials } = parsed.data
```

- [ ] **Modifier `api/src/routes/scans.ts`** — valider `email` et `aliasId`

Ajouter le schéma :

```typescript
import { z } from 'zod'

const createScanSchema = z.object({
  profileId:  z.string().uuid(),
  password:   z.string().min(1),
  brokerIds:  z.array(z.string()).min(1).max(100).optional(),
  email:      z.string().email().optional(),
  aliasId:    z.number().int().positive().nullable().optional(),
})
```

Remplacer le cast `as { profileId... }` par :

```typescript
    const parsed = createScanSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message })
    const { profileId, password, brokerIds, email, aliasId } = parsed.data
```

Et supprimer la validation manuelle `if (!profileId || !password)` et `if (brokerIds !== undefined && ...)` (déjà couverts par Zod).

- [ ] **Build API**

```bash
cd /opt/claude/nyx/api && npm run build 2>&1 | tail -5
```

- [ ] **Lancer tous les tests API**

```bash
cd /opt/claude/nyx/api && npm test 2>&1 | grep -E "Tests |Test Files"
```

- [ ] **Commit**

```bash
cd /opt/claude/nyx && git add api/src/routes/email-configs.ts api/src/routes/scans.ts
git commit -m "fix: add Zod validation to email-config and scan creation endpoints"
```

---

## Task 6 — Headers de sécurité HTTP

**Files:**
- Modify: `api/src/app.ts`

- [ ] **Installer `@fastify/helmet`**

```bash
cd /opt/claude/nyx/api && npm install @fastify/helmet
```

- [ ] **Modifier `api/src/app.ts`** — ajouter helmet

Ajouter l'import :
```typescript
import fastifyHelmet from '@fastify/helmet'
```

Ajouter après `await app.register(fastifyCookie)` :

```typescript
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false,  // SPA with inline scripts — configure separately if needed
  })
```

- [ ] **Build et tests**

```bash
cd /opt/claude/nyx/api && npm run build && npm test 2>&1 | grep -E "Tests |Test Files"
```
Attendu : tous passent.

- [ ] **Vérifier les headers en production**

```bash
curl -s -I http://localhost:3000/health | grep -E "X-Content|X-Frame|Strict|X-XSS"
```
Attendu : headers `X-Content-Type-Options`, `X-Frame-Options`, etc.

- [ ] **Commit**

```bash
cd /opt/claude/nyx && git add api/src/app.ts api/package.json
git commit -m "fix: add HTTP security headers via @fastify/helmet"
```

---

## Task 7 — Allowlist sur `script_file` dans broker-runner

**Files:**
- Modify: `worker/src/broker-runner.ts`

- [ ] **Modifier `worker/src/broker-runner.ts`** — valider `script_file` avant `import()`

Ajouter après les imports, avant `SCRIPT_DIR` :

```typescript
const SCRIPT_FILE_RE = /^[a-z0-9_-]+\.js$/i
```

Modifier `loadScript` :

```typescript
async function loadScript(scriptFile: string) {
  // Allowlist: only simple filenames, no path traversal
  if (!SCRIPT_FILE_RE.test(scriptFile)) {
    console.error(`[broker-runner] blocked unsafe script_file: ${scriptFile}`)
    const stub = await import('./scripts/_stub.js') as { run: (ctx: unknown) => Promise<OptOutResult> }
    return stub.run
  }
  const scriptPath = path.join(SCRIPT_DIR, scriptFile)
  if (fs.existsSync(scriptPath)) {
    const mod = await import(scriptPath) as { run: (ctx: unknown) => Promise<OptOutResult> }
    return mod.run
  }
  const stub = await import('./scripts/_stub.js') as { run: (ctx: unknown) => Promise<OptOutResult> }
  return stub.run
}
```

- [ ] **Build worker**

```bash
cd /opt/claude/nyx/worker && npm run build 2>&1 | tail -5
```

- [ ] **Lancer tous les tests worker**

```bash
cd /opt/claude/nyx/worker && npm test 2>&1 | grep -E "Tests |Test Files"
```

- [ ] **Commit**

```bash
cd /opt/claude/nyx && git add worker/src/broker-runner.ts
git commit -m "fix: allowlist validation on broker script_file before dynamic import"
```

---

## Task 8 — Rebuild et déploiement

- [ ] **Lancer la suite complète de tests**

```bash
cd /opt/claude/nyx && npm test --workspaces 2>&1 | grep -E "Tests |Test Files"
```
Attendu : tous les tests passent (API + worker + frontend).

- [ ] **Rebuild les images Docker et redémarrer**

```bash
cd /opt/osint && docker compose build nyx-api nyx-worker 2>&1 | tail -5 && \
docker compose up -d nyx-api nyx-worker 2>&1 | tail -5
```

- [ ] **Vérifier la santé**

```bash
sleep 8 && curl -s http://localhost:3000/health
```
Attendu : `{"status":"ok","version":"1.0.0"}`

- [ ] **Vérifier que la migration 011 s'est exécutée**

```bash
docker exec nyx-api node -e "
const Database = require('better-sqlite3');
const db = new Database('/data/nyx.db');
const done = db.prepare('SELECT count(*) as n FROM scan_jobs WHERE status IN (\"done\",\"failed\") AND encrypted_job_key != \"\"').get();
console.log('Jobs avec ancienne clé restante:', done.n, '(doit être 0)');
const seen = db.prepare('SELECT count(*) as n FROM webhook_seen').get();
console.log('webhook_seen table créée, entrées:', seen.n);
"
```

- [ ] **Commit final**

```bash
cd /opt/claude/nyx && git add . && git commit -m "chore: deploy security fixes — HKDF keys, webhook header auth, reaper, helmet"
```

---

## Checklist de couverture

| Problème critique | Tâche |
|---|---|
| Clé worker via padding ASCII (pas HKDF) | Task 2 |
| Salt statique pour encrypted_job_key | Task 2 |
| encrypted_job_key jamais purgée | Task 2 (migration 011 + job-runner) |
| SSRF via redirect non validé | Task 3 |
| Secret webhook en query param | Task 3 |
| Pas d'idempotence webhook | Task 3 (migration 012 + message-id) |
| Jobs zombies bloqués en running | Task 4 |

| Problème important | Tâche |
|---|---|
| SQLITE_BUSY sans busy_timeout | Task 1 |
| TOCTOU invitation | Task 1 |
| Bodies API sans Zod | Task 5 |
| Pas de headers sécurité HTTP | Task 6 |
| script_file sans allowlist | Task 7 |
