# Broker Report Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher un panneau latéral de rapport détaillé (statut, notes, screenshots Playwright, pattern email, guide manuel) quand l'utilisateur clique sur un broker dans ScanDetail, Brokers ou ProfileDetail.

**Architecture:** Un composant `BrokerReportPanel` fixe (overlay right drawer 360px) réutilisé dans les 3 surfaces. Chaque page gère `selectedOptOut: OptOutRequest | null` en état local. Le worker stocke le `jobId` dans `opt_out_requests.screenshot` pour localiser les captures. L'API expose 2 endpoints pour lister et servir les PNG.

**Tech Stack:** TypeScript, Fastify, better-sqlite3, Playwright (screenshots), React 19, Tailwind CSS, Vitest, @testing-library/react

---

## Fichiers touchés

| Fichier | Action | Rôle |
|---|---|---|
| `api/src/config.ts` | Modifier | Ajouter `SCREENSHOT_DIR` |
| `api/src/app.ts` | Modifier | Enregistrer la route screenshots |
| `api/src/routes/screenshots.ts` | Créer | Endpoints liste + serve PNG |
| `api/src/routes/opt-outs.ts` | Modifier | Ajouter `manual_guide` dans la query forProfile |
| `api/src/__tests__/screenshots.test.ts` | Créer | Tests TDD des 2 endpoints |
| `worker/src/broker-runner.ts` | Modifier | Stocker `jobId` dans `screenshot` |
| `worker/src/__tests__/broker-runner-screenshot.test.ts` | Créer | Test TDD du stockage jobId |
| `frontend/package.json` | Modifier | Ajouter vitest + @testing-library/react |
| `frontend/vitest.config.ts` | Créer | Config vitest frontend |
| `frontend/src/vitest.setup.ts` | Créer | Setup @testing-library/jest-dom |
| `frontend/src/types.ts` | Modifier | Ajouter `confirmation_pattern`, `manual_guide`, `screenshot` à `OptOutRequest` |
| `frontend/src/api/client.ts` | Modifier | Ajouter `optOuts.screenshots()` |
| `frontend/src/components/BrokerReportPanel.tsx` | Créer | Composant panneau rapport |
| `frontend/src/__tests__/BrokerReportPanel.test.tsx` | Créer | Tests unitaires composant |
| `frontend/src/pages/ScanDetail.tsx` | Modifier | Rows cliquables + panel |
| `frontend/src/pages/Brokers.tsx` | Modifier | Remplacer panneau droit |
| `frontend/src/pages/ProfileDetail.tsx` | Modifier | Ajouter liste brokers + panel |
| `compose.yml` | Modifier | Ajouter `SCREENSHOT_DIR` à `nyx-api` |

---

## Task 1 — Ajouter `SCREENSHOT_DIR` à l'API + compose

**Files:**
- Modify: `api/src/config.ts`
- Modify: `compose.yml`

- [ ] **Ajouter `SCREENSHOT_DIR` au schema de config API**

Dans `api/src/config.ts`, ajouter après `COOKIE_SECURE` :

```typescript
const schema = z.object({
  DB_PATH:        z.string().default('/data/nyx.db'),
  JWT_SECRET:     z.string().min(32),
  WORKER_SECRET:  z.string().min(32),
  PORT:           z.coerce.number().default(3000),
  NODE_ENV:       z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_DIST:  z.string().default('../frontend/dist'),
  COOKIE_SECURE:  z.coerce.boolean().default(false),
  SCREENSHOT_DIR: z.string().default('/data/screenshots'),
})
```

- [ ] **Ajouter la variable à `nyx-api` dans `compose.yml`**

Dans le bloc `environment` de `nyx-api` :

```yaml
  nyx-api:
    environment:
      - DB_PATH=/data/nyx.db
      - JWT_SECRET=${NYX_JWT_SECRET}
      - WORKER_SECRET=${NYX_WORKER_SECRET}
      - NODE_ENV=production
      - FRONTEND_DIST=/app/frontend/dist
      - SCREENSHOT_DIR=/data/screenshots
```

- [ ] **Vérifier que le build API passe encore**

```bash
cd /opt/claude/nyx/api && npm run build
```
Attendu : aucune erreur TypeScript.

- [ ] **Commit**

```bash
cd /opt/claude/nyx && git add api/src/config.ts compose.yml
git commit -m "feat: add SCREENSHOT_DIR to API config"
```

---

## Task 2 — Ajouter `manual_guide` dans la query opt-outs forProfile

**Files:**
- Modify: `api/src/routes/opt-outs.ts`
- Modify: `api/src/__tests__/scans.test.ts` (vérifier que les tests passent encore)

La route `GET /profiles/:id/opt-outs` ne retourne pas `manual_guide`. La corriger pour que `BrokerReportPanel` l'ait sans appel supplémentaire.

- [ ] **Modifier la query dans `opt-outs.ts`**

```typescript
const rows = db.prepare(`
  SELECT oor.*, b.name as broker_name, b.type as broker_type,
         b.url as broker_url, b.manual_guide
  FROM opt_out_requests oor
  JOIN brokers b ON b.id = oor.broker_id
  WHERE oor.profile_id = ?
  ORDER BY b.name
`).all(id)
```

- [ ] **Vérifier que les tests API existants passent**

```bash
cd /opt/claude/nyx/api && npm test
```
Attendu : 33 passed.

- [ ] **Commit**

```bash
git add api/src/routes/opt-outs.ts
git commit -m "feat: include manual_guide in opt-outs forProfile response"
```

---

## Task 3 — Worker stocke `jobId` dans `screenshot` (TDD)

**Files:**
- Create: `worker/src/__tests__/broker-runner-screenshot.test.ts`
- Modify: `worker/src/broker-runner.ts`

- [ ] **Écrire le test qui échoue**

Créer `worker/src/__tests__/broker-runner-screenshot.test.ts` :

```typescript
import { describe, it, expect, vi } from 'vitest'
import Database from 'better-sqlite3'

function makeDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE brokers (id TEXT PRIMARY KEY, name TEXT, url TEXT, country TEXT,
      type TEXT, script_file TEXT, manual_guide TEXT, active INTEGER DEFAULT 1);
    CREATE TABLE profiles (id TEXT PRIMARY KEY, user_id TEXT, label TEXT,
      encrypted_pii TEXT, created_at TEXT);
    CREATE TABLE opt_out_requests (id TEXT PRIMARY KEY, profile_id TEXT,
      broker_id TEXT, status TEXT DEFAULT 'pending', submitted_at TEXT,
      confirmed_at TEXT, last_attempt TEXT, attempts INTEGER DEFAULT 0,
      screenshot TEXT, notes TEXT, confirmation_pattern TEXT,
      UNIQUE(profile_id, broker_id));
    CREATE TABLE scan_jobs (id TEXT PRIMARY KEY, profile_id TEXT, broker_ids TEXT,
      status TEXT DEFAULT 'queued', encrypted_job_key TEXT, confirmation_email TEXT,
      created_at TEXT, started_at TEXT, finished_at TEXT, created_by TEXT);
    CREATE TABLE scan_events (id TEXT PRIMARY KEY, job_id TEXT, event_type TEXT,
      payload TEXT, created_at TEXT, broadcast INTEGER DEFAULT 0);
    INSERT INTO brokers VALUES ('testbroker','Test','http://test.com','US','auto','_stub.js',NULL,1);
    INSERT INTO profiles VALUES ('p1','u1','Test','{}','2026-01-01');
    INSERT INTO opt_out_requests (id, profile_id, broker_id) VALUES ('oo1','p1','testbroker');
  `)
  return db
}

describe('broker-runner screenshot storage', () => {
  it('stores jobId in opt_out_requests.screenshot after running a broker', async () => {
    const db = makeDb()
    db.prepare("INSERT INTO scan_jobs VALUES ('job1','p1',NULL,'queued','{}',NULL,'2026-01-01',NULL,NULL,'u1')").run()

    // Import runBroker (we will mock playwright and the script)
    vi.mock('playwright-extra', () => ({
      chromium: {
        use: vi.fn(),
        launch: vi.fn().mockResolvedValue({
          newContext: vi.fn().mockResolvedValue({
            newPage: vi.fn().mockResolvedValue({
              setViewportSize: vi.fn(),
              setExtraHTTPHeaders: vi.fn(),
            }),
          }),
          close: vi.fn(),
        }),
      },
    }))
    vi.mock('puppeteer-extra-plugin-stealth', () => ({ default: vi.fn() }))

    const { runBroker } = await import('../broker-runner.js')

    const pii = {
      firstName: 'Alice', lastName: 'Dupont', dob: '1990-01-01',
      currentAddress: { street: '1 rue de la Paix', city: 'Paris', country: 'FR' },
    }

    await runBroker(db, 'job1', 'p1', 'testbroker', pii)

    const row = db.prepare('SELECT screenshot FROM opt_out_requests WHERE id = ?').get('oo1') as { screenshot: string | null }
    expect(row.screenshot).toBe('job1')
  })

  it('does not overwrite an existing screenshot job_id (COALESCE)', async () => {
    const db = makeDb()
    db.prepare('UPDATE opt_out_requests SET screenshot = ? WHERE id = ?').run('job0', 'oo1')
    db.prepare("INSERT INTO scan_jobs VALUES ('job1','p1',NULL,'queued','{}',NULL,'2026-01-01',NULL,NULL,'u1')").run()

    const { runBroker } = await import('../broker-runner.js')
    const pii = {
      firstName: 'Alice', lastName: 'Dupont', dob: '1990-01-01',
      currentAddress: { street: '1 rue de la Paix', city: 'Paris', country: 'FR' },
    }

    await runBroker(db, 'job1', 'p1', 'testbroker', pii)

    const row = db.prepare('SELECT screenshot FROM opt_out_requests WHERE id = ?').get('oo1') as { screenshot: string | null }
    expect(row.screenshot).toBe('job0')
  })
})
```

- [ ] **Vérifier que le test échoue**

```bash
cd /opt/claude/nyx/worker && npx vitest run src/__tests__/broker-runner-screenshot.test.ts
```
Attendu : FAIL — `screenshot` est NULL.

- [ ] **Modifier `broker-runner.ts` pour stocker `jobId`**

Dans `worker/src/broker-runner.ts`, ligne ~72, modifier le `db.prepare` UPDATE :

```typescript
db.prepare(`
  UPDATE opt_out_requests
  SET status = ?, last_attempt = ?, attempts = attempts + 1,
      submitted_at = CASE WHEN ? IN ('submitted','awaiting_email','confirmed') THEN ? ELSE submitted_at END,
      notes = ?,
      confirmation_pattern = COALESCE(?, confirmation_pattern),
      screenshot = COALESCE(screenshot, ?)
  WHERE profile_id = ? AND broker_id = ?
`).run(
  result.status, new Date().toISOString(),
  result.status, new Date().toISOString(),
  notes,
  confirmationPattern,
  jobId,
  profileId, brokerId,
)
```

- [ ] **Vérifier que les tests passent**

```bash
cd /opt/claude/nyx/worker && npm test
```
Attendu : tous les tests passent, y compris les 2 nouveaux.

- [ ] **Commit**

```bash
cd /opt/claude/nyx && git add worker/src/broker-runner.ts worker/src/__tests__/broker-runner-screenshot.test.ts
git commit -m "feat: store jobId in opt_out_requests.screenshot for screenshot location"
```

---

## Task 4 — Endpoints screenshots API (TDD)

**Files:**
- Create: `api/src/routes/screenshots.ts`
- Create: `api/src/__tests__/screenshots.test.ts`
- Modify: `api/src/app.ts`

- [ ] **Écrire les tests qui échouent**

Créer `api/src/__tests__/screenshots.test.ts` :

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildApp } from '../app.js'
import { runMigrations } from '../db/migrate.js'
import { closeDb, getDb } from '../db/client.js'
import type { FastifyInstance } from 'fastify'

process.env.DB_PATH       = ':memory:'
process.env.JWT_SECRET    = 'a'.repeat(32)
process.env.WORKER_SECRET = 'b'.repeat(32)
process.env.SCREENSHOT_DIR = '/tmp/nyx-test-screenshots'

// Mock fs pour isoler les tests du filesystem réel
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    createReadStream: vi.fn(),
  }
})

import fs from 'node:fs'

let app: FastifyInstance
let sessionCookie: string
let optOutId: string

beforeEach(async () => {
  vi.resetAllMocks()
  runMigrations()
  app = await buildApp()
  await app.ready()

  // Créer un admin
  await app.inject({ method: 'POST', url: '/api/auth/register',
    payload: { email: 'admin@nyx.local', password: 'StrongPass1!' } })
  const login = await app.inject({ method: 'POST', url: '/api/auth/login',
    payload: { email: 'admin@nyx.local', password: 'StrongPass1!' } })
  sessionCookie = login.cookies.find(c => c.name === 'nyx_session')!.value

  // Créer un profil
  const pRes = await app.inject({ method: 'POST', url: '/api/profiles',
    cookies: { nyx_session: sessionCookie },
    payload: { label: 'Alice', password: 'StrongPass1!',
      pii: { firstName: 'Alice', lastName: 'D', dob: '1990-01-01',
             currentAddress: { street: '1 rue', city: 'Paris', country: 'FR' } } } })
  const profileId = pRes.json().id

  // Insérer un opt-out avec screenshot=job1
  const db = getDb()
  const optOut = db.prepare(
    'SELECT id FROM opt_out_requests WHERE profile_id = ? LIMIT 1'
  ).get(profileId) as { id: string }
  optOutId = optOut.id
  db.prepare('UPDATE opt_out_requests SET screenshot = ? WHERE id = ?').run('job1', optOutId)
})

afterEach(async () => { await app.close(); closeDb() })

describe('GET /api/opt-outs/:id/screenshots', () => {
  it('retourne la liste des PNG disponibles', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue(['form-filled.png', 'submitted.png'] as any)

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

  it('retourne [] si le dossier n\'existe pas', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

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
      method: 'GET', url: `/api/opt-outs/${optOutId}/screenshot/../secret.png`,
      cookies: { nyx_session: sessionCookie },
    })
    expect(res.statusCode).toBe(400)
  })

  it('retourne 400 si filename contient des caractères invalides', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/opt-outs/${optOutId}/screenshot/../../etc/passwd`,
      cookies: { nyx_session: sessionCookie },
    })
    expect(res.statusCode).toBe(400)
  })

  it('retourne 404 si le fichier n\'existe pas sur disque', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const res = await app.inject({
      method: 'GET', url: `/api/opt-outs/${optOutId}/screenshot/form-filled.png`,
      cookies: { nyx_session: sessionCookie },
    })
    expect(res.statusCode).toBe(404)
  })

  it('sert le PNG avec Content-Type image/png', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    const fakeStream = require('node:stream').Readable.from(Buffer.from('PNG'))
    vi.mocked(fs.createReadStream).mockReturnValue(fakeStream)

    const res = await app.inject({
      method: 'GET', url: `/api/opt-outs/${optOutId}/screenshot/form-filled.png`,
      cookies: { nyx_session: sessionCookie },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('image/png')
  })
})
```

- [ ] **Vérifier que les tests échouent (routes inexistantes)**

```bash
cd /opt/claude/nyx/api && npx vitest run src/__tests__/screenshots.test.ts
```
Attendu : FAIL — 404 sur toutes les routes.

- [ ] **Créer `api/src/routes/screenshots.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import fs from 'node:fs'
import path from 'node:path'
import { getDb } from '../db/client.js'
import { requireAuth } from '../auth/middleware.js'
import { config } from '../config.js'

const FILENAME_RE = /^[a-z0-9_-]+\.png$/i

interface OptOutScreenshotRow {
  screenshot: string | null
  broker_id: string
  user_id: string
}

async function resolveOptOut(
  id: string,
  app: FastifyInstance,
): Promise<OptOutScreenshotRow | null> {
  const db = getDb()
  return db.prepare(`
    SELECT oor.screenshot, oor.broker_id, p.user_id
    FROM opt_out_requests oor
    JOIN profiles p ON p.id = oor.profile_id
    WHERE oor.id = ?
  `).get(id) as OptOutScreenshotRow | null
}

export function registerScreenshotRoutes(app: FastifyInstance): void {

  app.get('/opt-outs/:id/screenshots', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }

    const row = await resolveOptOut(id, app)
    if (!row) return reply.code(404).send({ error: 'Not found' })
    if (req.user.role !== 'admin' && row.user_id !== req.user.id) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    if (!row.screenshot) return reply.send([])

    const dir = path.join(config.SCREENSHOT_DIR, row.screenshot, row.broker_id)
    if (!fs.existsSync(dir)) return reply.send([])

    const files = (fs.readdirSync(dir) as string[]).filter(f => FILENAME_RE.test(f))
    return reply.send(files.map(filename => ({
      filename,
      url: `/api/opt-outs/${id}/screenshot/${filename}`,
    })))
  })

  app.get('/opt-outs/:id/screenshot/:filename', { preHandler: requireAuth }, async (req, reply) => {
    const { id, filename } = req.params as { id: string; filename: string }

    if (!FILENAME_RE.test(filename)) {
      return reply.code(400).send({ error: 'Invalid filename' })
    }

    const row = await resolveOptOut(id, app)
    if (!row) return reply.code(404).send({ error: 'Not found' })
    if (req.user.role !== 'admin' && row.user_id !== req.user.id) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    if (!row.screenshot) return reply.code(404).send({ error: 'No screenshots' })

    const filePath = path.join(config.SCREENSHOT_DIR, row.screenshot, row.broker_id, filename)
    if (!fs.existsSync(filePath)) return reply.code(404).send({ error: 'File not found' })

    return reply.type('image/png').send(fs.createReadStream(filePath))
  })
}
```

- [ ] **Enregistrer la route dans `api/src/app.ts`**

Ajouter l'import et l'appel dans le bloc `await app.register(async (api) => { ... })` :

```typescript
const { registerScreenshotRoutes } = await import('./routes/screenshots.js')
// ... dans le register block :
registerScreenshotRoutes(api)
```

- [ ] **Lancer tous les tests API**

```bash
cd /opt/claude/nyx/api && npm test
```
Attendu : tous les tests passent (33 existants + nouveaux screenshots).

- [ ] **Commit**

```bash
cd /opt/claude/nyx && git add api/src/routes/screenshots.ts api/src/app.ts api/src/__tests__/screenshots.test.ts
git commit -m "feat: add screenshot listing and serving endpoints for opt-outs"
```

---

## Task 5 — Setup tests frontend + mise à jour des types

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/vitest.setup.ts`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api/client.ts`

- [ ] **Installer les dépendances de test frontend**

```bash
cd /opt/claude/nyx/frontend && npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Créer `frontend/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
    coverage: { reporter: ['text', 'lcov'] },
  },
})
```

- [ ] **Créer `frontend/src/vitest.setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Ajouter le script `test` dans `frontend/package.json`**

```json
"scripts": {
  "dev":     "vite",
  "build":   "tsc && vite build",
  "preview": "vite preview",
  "test":    "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Mettre à jour `frontend/src/types.ts` — ajouter les champs manquants à `OptOutRequest`**

```typescript
export interface OptOutRequest {
  id: string
  profile_id: string
  broker_id: string
  status: 'pending' | 'submitted' | 'awaiting_email' | 'confirmed' | 'failed' | 'manual' | 'already_removed'
  submitted_at: string | null
  confirmed_at: string | null
  last_attempt: string | null
  attempts: number
  notes: string | null
  screenshot: string | null          // jobId stocké par le worker
  confirmation_pattern: string | null
  manual_guide: string | null
  broker_name?: string
  broker_type?: string
  broker_url?: string
}
```

- [ ] **Ajouter `screenshots` dans `frontend/src/api/client.ts`**

Dans le bloc `optOuts` :

```typescript
optOuts: {
  forProfile: (profileId: string) => req('GET', `/profiles/${profileId}/opt-outs`),
  get:        (id: string) => req('GET', `/opt-outs/${id}`),
  screenshots: (id: string) =>
    req<{ filename: string; url: string }[]>('GET', `/opt-outs/${id}/screenshots`),
},
```

- [ ] **Vérifier que le build frontend passe**

```bash
cd /opt/claude/nyx/frontend && npm run build
```
Attendu : aucune erreur TypeScript.

- [ ] **Commit**

```bash
cd /opt/claude/nyx && git add frontend/package.json frontend/vitest.config.ts frontend/src/vitest.setup.ts frontend/src/types.ts frontend/src/api/client.ts frontend/package-lock.json
git commit -m "feat: add frontend test setup and update OptOutRequest type"
```

---

## Task 6 — Composant `BrokerReportPanel` (TDD)

**Files:**
- Create: `frontend/src/__tests__/BrokerReportPanel.test.tsx`
- Create: `frontend/src/components/BrokerReportPanel.tsx`

- [ ] **Écrire les tests qui échouent**

Créer `frontend/src/__tests__/BrokerReportPanel.test.tsx` :

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { BrokerReportPanel } from '../components/BrokerReportPanel.js'
import type { OptOutRequest } from '../types.js'

// Mock api.optOuts.screenshots
vi.mock('../api/client.js', () => ({
  api: {
    optOuts: {
      screenshots: vi.fn().mockResolvedValue([]),
    },
  },
}))

const baseOptOut: OptOutRequest = {
  id: 'oo1',
  profile_id: 'p1',
  broker_id: 'spokeo',
  status: 'failed',
  submitted_at: null,
  confirmed_at: null,
  last_attempt: '2026-06-04T14:32:00.000Z',
  attempts: 3,
  notes: 'captcha on Spokeo search',
  screenshot: null,
  confirmation_pattern: null,
  manual_guide: null,
  broker_name: 'Spokeo',
  broker_type: 'auto',
  broker_url: 'https://www.spokeo.com/optout',
}

describe('BrokerReportPanel', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('ne rend rien si optOut est null', () => {
    const { container } = render(
      <BrokerReportPanel optOut={null} onClose={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('affiche le nom du broker et le statut', () => {
    render(<BrokerReportPanel optOut={baseOptOut} onClose={vi.fn()} />)
    expect(screen.getByText('Spokeo')).toBeInTheDocument()
    expect(screen.getByText('failed')).toBeInTheDocument()
  })

  it('affiche les notes quand elles sont présentes', () => {
    render(<BrokerReportPanel optOut={baseOptOut} onClose={vi.fn()} />)
    expect(screen.getByText('captcha on Spokeo search')).toBeInTheDocument()
  })

  it('n\'affiche pas la section notes si notes est null', () => {
    render(<BrokerReportPanel optOut={{ ...baseOptOut, notes: null }} onClose={vi.fn()} />)
    expect(screen.queryByText(/raison/i)).not.toBeInTheDocument()
  })

  it('affiche le confirmation_pattern pour awaiting_email', () => {
    const optOut = { ...baseOptOut, status: 'awaiting_email' as const, confirmation_pattern: 'spokeo' }
    render(<BrokerReportPanel optOut={optOut} onClose={vi.fn()} />)
    expect(screen.getByText('spokeo')).toBeInTheDocument()
  })

  it('n\'affiche pas le pattern email si statut différent de awaiting_email', () => {
    const optOut = { ...baseOptOut, status: 'failed' as const, confirmation_pattern: 'spokeo' }
    render(<BrokerReportPanel optOut={optOut} onClose={vi.fn()} />)
    // Le pattern ne s'affiche que pour awaiting_email
    expect(screen.queryByText(/email.*attendu/i)).not.toBeInTheDocument()
  })

  it('affiche le guide manuel si manual_guide est présent', () => {
    const guide = '1. Va sur whitepages.com\n2. Cherche ton nom'
    render(<BrokerReportPanel optOut={{ ...baseOptOut, manual_guide: guide }} onClose={vi.fn()} />)
    expect(screen.getByText(/Va sur whitepages.com/)).toBeInTheDocument()
  })

  it('appelle onClose quand on clique ✕', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<BrokerReportPanel optOut={baseOptOut} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: /fermer/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('appelle onClose sur Échap', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<BrokerReportPanel optOut={baseOptOut} onClose={onClose} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('charge et affiche les screenshots disponibles', async () => {
    const { api } = await import('../api/client.js')
    vi.mocked(api.optOuts.screenshots).mockResolvedValue([
      { filename: 'form-filled.png', url: '/api/opt-outs/oo1/screenshot/form-filled.png' },
    ])
    render(<BrokerReportPanel optOut={{ ...baseOptOut, screenshot: 'job1' }} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByAltText('form-filled.png')).toBeInTheDocument())
  })
})
```

- [ ] **Vérifier que les tests échouent**

```bash
cd /opt/claude/nyx/frontend && npx vitest run src/__tests__/BrokerReportPanel.test.tsx
```
Attendu : FAIL — module non trouvé.

- [ ] **Créer `frontend/src/components/BrokerReportPanel.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { X, Mail, BookOpen, Camera } from 'lucide-react'
import { api } from '../api/client.js'
import { StatusBadge } from './StatusBadge.js'
import type { OptOutRequest } from '../types.js'

interface Screenshot { filename: string; url: string }

interface BrokerReportPanelProps {
  optOut: OptOutRequest | null
  onClose: () => void
}

function Section({ title }: { title: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2 mt-4 first:mt-0">
      {title}
    </p>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start text-sm mb-1.5">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-200 text-right max-w-[220px]">{value}</span>
    </div>
  )
}

function fmt(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

export function BrokerReportPanel({ optOut, onClose }: BrokerReportPanelProps) {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [activeShot, setActiveShot]   = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  // Fermeture sur Échap
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Charger les screenshots quand l'opt-out change
  useEffect(() => {
    setScreenshots([])
    setActiveShot(0)
    if (!optOut?.screenshot) return
    api.optOuts.screenshots(optOut.id).then(setScreenshots).catch(() => {})
  }, [optOut?.id, optOut?.screenshot])

  if (!optOut) return null

  return (
    <div
      ref={panelRef}
      className="fixed inset-y-0 right-0 w-[360px] bg-slate-950 border-l border-slate-800
        shadow-2xl overflow-y-auto z-50 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-slate-800 sticky top-0 bg-slate-950">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-white truncate">
            {optOut.broker_name ?? optOut.broker_id}
          </h2>
          {optOut.broker_url && (
            <a
              href={optOut.broker_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-violet-400 hover:underline truncate block mt-0.5"
            >
              {optOut.broker_url.replace(/^https?:\/\//, '')}
            </a>
          )}
        </div>
        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
          <StatusBadge status={optOut.status} />
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 flex-1">

        {/* Résultat */}
        <Section title="Résultat" />
        <Field label="Tentatives" value={`${optOut.attempts}`} />
        <Field label="Dernier essai" value={fmt(optOut.last_attempt)} />
        <Field label="Soumis le" value={fmt(optOut.submitted_at)} />
        {optOut.confirmed_at && (
          <Field label="Confirmé le" value={fmt(optOut.confirmed_at)} />
        )}

        {/* Raison */}
        {optOut.notes && (
          <>
            <Section title="Raison" />
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-[12px] text-slate-400 leading-relaxed">
              {optOut.notes}
            </div>
          </>
        )}

        {/* Email de confirmation attendu */}
        {optOut.status === 'awaiting_email' && optOut.confirmation_pattern && (
          <>
            <Section title="Email de confirmation attendu" />
            <div className="flex items-center gap-2 bg-slate-900 border border-green-900/40 rounded-lg p-2.5">
              <Mail size={13} className="text-green-400 flex-shrink-0" />
              <code className="text-[11px] text-green-400 font-mono">{optOut.confirmation_pattern}</code>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
              Nyx détectera automatiquement l'email et passera le statut à <strong className="text-green-400">confirmed</strong>.
            </p>
          </>
        )}

        {/* Screenshots */}
        {screenshots.length > 0 && (
          <>
            <Section title="Screenshots" />
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
              {/* Onglets */}
              <div className="flex border-b border-slate-800 overflow-x-auto">
                {screenshots.map((s, i) => (
                  <button
                    key={s.filename}
                    onClick={() => setActiveShot(i)}
                    className={`px-3 py-1.5 text-[10px] whitespace-nowrap transition flex-shrink-0 ${
                      i === activeShot
                        ? 'text-violet-400 border-b-2 border-violet-500'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {s.filename}
                  </button>
                ))}
              </div>
              {/* Image */}
              <div className="p-2">
                <img
                  src={screenshots[activeShot].url}
                  alt={screenshots[activeShot].filename}
                  className="w-full rounded object-contain"
                  style={{ aspectRatio: '16/9', background: '#0f172a' }}
                />
              </div>
            </div>
          </>
        )}

        {/* Guide manuel */}
        {optOut.manual_guide && (
          <>
            <Section title="Guide de suppression manuelle" />
            <div className="flex items-center gap-1.5 mb-2">
              <BookOpen size={12} className="text-violet-400" />
              <span className="text-[11px] text-violet-400">Instructions étape par étape</span>
            </div>
            <div className="bg-slate-900 border border-violet-900/30 rounded-lg p-3
              text-[12px] text-slate-400 whitespace-pre-wrap leading-relaxed">
              {optOut.manual_guide}
            </div>
          </>
        )}

        {/* Infos broker */}
        <Section title="Broker" />
        <Field label="Type" value={optOut.broker_type ?? '—'} />
        <Field label="Pays" value="US" />

      </div>
    </div>
  )
}
```

- [ ] **Lancer les tests**

```bash
cd /opt/claude/nyx/frontend && npx vitest run src/__tests__/BrokerReportPanel.test.tsx
```
Attendu : tous les tests passent.

- [ ] **Commit**

```bash
cd /opt/claude/nyx && git add frontend/src/components/BrokerReportPanel.tsx frontend/src/__tests__/BrokerReportPanel.test.tsx
git commit -m "feat: add BrokerReportPanel component with TDD"
```

---

## Task 7 — Intégrer dans `ScanDetail`

**Files:**
- Modify: `frontend/src/pages/ScanDetail.tsx`

- [ ] **Rendre les broker rows cliquables et monter le panel**

Remplacer le contenu de `ScanDetail.tsx` :

```tsx
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ChevronLeft, CheckCircle2, XCircle, Clock, Loader2, AlertTriangle, Mail,
} from 'lucide-react'
import { api } from '../api/client.js'
import { StatusBadge } from '../components/StatusBadge.js'
import { BrokerReportPanel } from '../components/BrokerReportPanel.js'
import type { ScanJob, OptOutRequest } from '../types.js'

function duration(job: ScanJob): string | null {
  const start = job.started_at ?? job.created_at
  if (!job.finished_at) return null
  const s = Math.round((new Date(job.finished_at).getTime() - new Date(start).getTime()) / 1000)
  return s < 60 ? `${s}s` : `${Math.round(s / 60)}m`
}

function ScanStatusChip({ status }: { status: ScanJob['status'] }) {
  if (status === 'queued')  return <span className="flex items-center gap-1.5 text-slate-400 text-sm"><Clock size={14} /> Queued</span>
  if (status === 'running') return <span className="flex items-center gap-1.5 text-blue-400 text-sm"><Loader2 size={14} className="animate-spin" /> Running</span>
  if (status === 'failed')  return <span className="flex items-center gap-1.5 text-red-400 text-sm"><XCircle size={14} /> Failed</span>
  return <span className="flex items-center gap-1.5 text-green-400 text-sm"><CheckCircle2 size={14} /> Done</span>
}

const STATUS_GROUPS = [
  { label: 'Need manual action',          statuses: ['manual'] },
  { label: 'Awaiting email confirmation', statuses: ['awaiting_email'] },
  { label: 'Failed',                      statuses: ['failed'] },
  { label: 'Confirmed removed',           statuses: ['confirmed', 'already_removed'] },
  { label: 'Submitted',                   statuses: ['submitted'] },
  { label: 'Pending',                     statuses: ['pending', 'queued'] },
]

export function ScanDetail() {
  const { id } = useParams<{ id: string }>()
  const [job, setJob]                 = useState<ScanJob | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [selectedOptOut, setSelected] = useState<OptOutRequest | null>(null)

  useEffect(() => {
    if (!id) return
    api.scans.get(id)
      .then(data => setJob(data as ScanJob))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>
  if (error)   return <div className="p-8 text-red-400">{error}</div>
  if (!job)    return <div className="p-8 text-slate-400">Scan not found.</div>

  const optOuts = job.opt_outs ?? []
  const dur = duration(job)

  const counts = {
    confirmed:      optOuts.filter(o => o.status === 'confirmed' || o.status === 'already_removed').length,
    awaiting_email: optOuts.filter(o => o.status === 'awaiting_email').length,
    failed:         optOuts.filter(o => o.status === 'failed').length,
    manual:         optOuts.filter(o => o.status === 'manual').length,
    submitted:      optOuts.filter(o => o.status === 'submitted').length,
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/history" className="text-slate-400 hover:text-white transition">
          <ChevronLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Scan detail</h1>
          {job.profile_label && (
            <p className="text-sm text-slate-400 mt-0.5">
              Profile:{' '}
              <Link to={`/profiles/${job.profile_id}`} className="text-brand-400 hover:underline">
                {job.profile_label}
              </Link>
            </p>
          )}
        </div>
      </div>

      {/* Scan metadata card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6 flex flex-wrap gap-6">
        <div><p className="text-xs text-slate-500 mb-1">Status</p><ScanStatusChip status={job.status} /></div>
        <div><p className="text-xs text-slate-500 mb-1">Started</p><p className="text-sm text-white">{new Date(job.created_at).toLocaleString()}</p></div>
        {dur && <div><p className="text-xs text-slate-500 mb-1">Duration</p><p className="text-sm text-white">{dur}</p></div>}
        {job.confirmation_email && (
          <div>
            <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Mail size={11} /> Confirmation email</p>
            <p className="text-sm text-white font-mono">{job.confirmation_email}</p>
          </div>
        )}
        <div><p className="text-xs text-slate-500 mb-1">Brokers</p><p className="text-sm text-white">{optOuts.length}</p></div>
      </div>

      {/* KPIs */}
      {optOuts.length > 0 && (
        <div className="grid grid-cols-5 gap-2 mb-6">
          {[
            { label: 'Confirmed',     value: counts.confirmed,      icon: <CheckCircle2 size={14} className="text-green-400"  />, color: 'text-green-400'  },
            { label: 'Email pending', value: counts.awaiting_email, icon: <Clock size={14} className="text-orange-400" />,        color: 'text-orange-400' },
            { label: 'Submitted',     value: counts.submitted,      icon: <CheckCircle2 size={14} className="text-yellow-400" />, color: 'text-yellow-400' },
            { label: 'Manual',        value: counts.manual,         icon: <AlertTriangle size={14} className="text-yellow-400" />,color: 'text-yellow-400' },
            { label: 'Failed',        value: counts.failed,         icon: <XCircle size={14} className="text-red-400"   />,       color: 'text-red-400'   },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
              <div className={`flex justify-center mb-1 ${color}`}>{icon}</div>
              <p className="text-xl font-bold text-white">{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Opt-out requests groupées par statut */}
      {optOuts.length === 0 ? (
        <div className="text-slate-400 text-sm">No opt-out requests for this scan.</div>
      ) : (
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Opt-out requests
          </h2>
          {STATUS_GROUPS.map(({ label, statuses }) => {
            const items = optOuts.filter((o: OptOutRequest) => statuses.includes(o.status))
            if (items.length === 0) return null
            return (
              <div key={label} className="mb-5">
                <h3 className="text-xs text-slate-500 mb-2">{label} ({items.length})</h3>
                <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden">
                  {items.map((oo: OptOutRequest) => (
                    <button
                      key={oo.id}
                      onClick={() => setSelected(prev => prev?.id === oo.id ? null : oo)}
                      className={`w-full bg-slate-900 px-4 py-3 flex items-center justify-between
                        hover:bg-slate-800/60 transition text-left
                        ${selectedOptOut?.id === oo.id ? 'ring-1 ring-inset ring-brand-500/40 bg-slate-800/60' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-white">{oo.broker_name ?? oo.broker_id}</span>
                        {oo.broker_type && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            oo.broker_type === 'auto' ? 'bg-green-900/40 text-green-400' :
                            oo.broker_type === 'semi' ? 'bg-yellow-900/40 text-yellow-400' :
                            'bg-slate-700 text-slate-400'
                          }`}>
                            {oo.broker_type}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {oo.attempts > 0 && (
                          <span className="text-xs text-slate-500">{oo.attempts} attempt{oo.attempts > 1 ? 's' : ''}</span>
                        )}
                        <StatusBadge status={oo.status} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <BrokerReportPanel optOut={selectedOptOut} onClose={() => setSelected(null)} />
    </div>
  )
}
```

- [ ] **Vérifier que le build passe**

```bash
cd /opt/claude/nyx/frontend && npm run build
```
Attendu : aucune erreur TypeScript.

- [ ] **Commit**

```bash
cd /opt/claude/nyx && git add frontend/src/pages/ScanDetail.tsx
git commit -m "feat: broker rows clickable with report panel in ScanDetail"
```

---

## Task 8 — Intégrer dans `Brokers`

**Files:**
- Modify: `frontend/src/pages/Brokers.tsx`

- [ ] **Remplacer le panneau droit par `BrokerReportPanel`**

Dans `Brokers.tsx`, ajouter l'import et remplacer le bloc `<div className="w-96 ...">` :

```tsx
import { BrokerReportPanel } from '../components/BrokerReportPanel.js'
```

Remplacer l'état `selected: Broker | null` par :

```tsx
const [selectedOptOut, setSelectedOptOut] = useState<OptOutRequest | null>(null)
```

À chaque clic sur un broker row, construire l'`OptOutRequest` à partir des données déjà chargées :

```tsx
<button key={broker.id}
  onClick={() => {
    const oo = optOuts.find(o => o.broker_id === broker.id) ?? null
    setSelectedOptOut(oo ? { ...oo, broker_name: broker.name, broker_type: broker.type, broker_url: broker.url } : null)
  }}
  className={`w-full flex items-center px-6 py-4 hover:bg-slate-900/50 transition text-left
    ${selectedOptOut?.broker_id === broker.id ? 'bg-slate-900/50' : ''}`}>
  <div className="flex-1">
    <div className="flex items-center gap-2 mb-1">
      <span className="text-white text-sm font-medium">{broker.name}</span>
      <span className={`text-xs px-1.5 py-0.5 rounded ${broker.type === 'auto' ? 'bg-green-900/50 text-green-400' : broker.type === 'semi' ? 'bg-yellow-900/50 text-yellow-400' : 'bg-slate-700 text-slate-400'}`}>
        {broker.type}
      </span>
    </div>
    <StatusBadge status={getStatus(broker.id)} />
  </div>
  <ChevronRight size={16} className="text-slate-600" />
</button>
```

Supprimer le `<div className="w-96 flex-shrink-0 ...">` entier et le remplacer par :

```tsx
<BrokerReportPanel optOut={selectedOptOut} onClose={() => setSelectedOptOut(null)} />
```

La page devient simplement `<div className="flex h-screen overflow-hidden">` avec la liste à gauche et le panel en overlay.

- [ ] **Vérifier que le build passe**

```bash
cd /opt/claude/nyx/frontend && npm run build
```

- [ ] **Commit**

```bash
cd /opt/claude/nyx && git add frontend/src/pages/Brokers.tsx
git commit -m "feat: replace Brokers right panel with BrokerReportPanel"
```

---

## Task 9 — Intégrer dans `ProfileDetail`

**Files:**
- Modify: `frontend/src/pages/ProfileDetail.tsx`

- [ ] **Ajouter l'état et l'import**

En haut de `ProfileDetail.tsx` :

```tsx
import { BrokerReportPanel } from '../components/BrokerReportPanel.js'
```

Dans le composant, ajouter :

```tsx
const [selectedOptOut, setSelectedOptOut] = useState<OptOutRequest | null>(null)
```

- [ ] **Ajouter la section liste de brokers après le scan history**

Après le bloc `{jobs.length === 0 && ...}`, ajouter :

```tsx
{optOuts.length > 0 && (
  <div className="mt-8">
    <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
      Opt-out status
    </h2>
    <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden">
      {[...optOuts]
        .sort((a, b) => {
          const order = ['failed', 'manual', 'awaiting_email', 'submitted', 'pending', 'confirmed', 'already_removed']
          return order.indexOf(a.status) - order.indexOf(b.status)
        })
        .map(oo => (
          <button
            key={oo.id}
            onClick={() => setSelectedOptOut(prev => prev?.id === oo.id ? null : oo)}
            className={`w-full bg-slate-900 px-4 py-3 flex items-center justify-between
              hover:bg-slate-800/60 transition text-left
              ${selectedOptOut?.id === oo.id ? 'ring-1 ring-inset ring-brand-500/40 bg-slate-800/60' : ''}`}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm text-white">{oo.broker_name ?? oo.broker_id}</span>
              {oo.broker_type && (
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  oo.broker_type === 'auto' ? 'bg-green-900/40 text-green-400' :
                  oo.broker_type === 'semi' ? 'bg-yellow-900/40 text-yellow-400' :
                  'bg-slate-700 text-slate-400'
                }`}>
                  {oo.broker_type}
                </span>
              )}
            </div>
            <StatusBadge status={oo.status} />
          </button>
        ))}
    </div>
  </div>
)}

<BrokerReportPanel optOut={selectedOptOut} onClose={() => setSelectedOptOut(null)} />
```

- [ ] **Vérifier que le build passe**

```bash
cd /opt/claude/nyx/frontend && npm run build
```

- [ ] **Lancer tous les tests**

```bash
cd /opt/claude/nyx && npm test --workspaces 2>&1 | grep -E "Tests |Test Files"
```
Attendu : tous les tests passent.

- [ ] **Commit**

```bash
cd /opt/claude/nyx && git add frontend/src/pages/ProfileDetail.tsx
git commit -m "feat: add broker opt-out list with report panel in ProfileDetail"
```

---

## Task 10 — Code Review + Security Review (ECC obligatoire)

- [ ] **Lancer le code-reviewer agent**

```
Agent: code-reviewer
Scope: tous les fichiers modifiés dans ce plan
```

Résoudre tous les problèmes CRITICAL et HIGH avant de continuer.

- [ ] **Lancer le security-reviewer agent**

Périmètre prioritaire :
- `api/src/routes/screenshots.ts` — filesystem access, auth, path traversal
- `worker/src/broker-runner.ts` — SQL update avec nouvelle colonne

Résoudre tous les problèmes CRITICAL avant tout merge.

- [ ] **Commit final après corrections**

```bash
cd /opt/claude/nyx && git add -p
git commit -m "fix: address code and security review findings"
```

---

## Checklist de couverture spec

| Exigence spec | Tâche |
|---|---|
| Stocker jobId dans screenshot | Task 3 |
| `GET /opt-outs/:id/screenshots` | Task 4 |
| `GET /opt-outs/:id/screenshot/:filename` | Task 4 |
| Validation filename (path traversal) | Task 4 tests |
| Auth + ownership sur endpoints screenshots | Task 4 tests |
| `SCREENSHOT_DIR` dans API config | Task 1 |
| `confirmation_pattern` + `manual_guide` dans types | Task 5 |
| `api.optOuts.screenshots()` | Task 5 |
| `BrokerReportPanel` composant | Task 6 |
| Fermeture Échap | Task 6 tests |
| Intégration ScanDetail | Task 7 |
| Intégration Brokers | Task 8 |
| Intégration ProfileDetail | Task 9 |
| Code review + Security review | Task 10 |
