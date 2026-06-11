# Nyx Senior Architecture Review — Bug Fixes & Optimizations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all bugs and quality issues identified during the comprehensive senior-level code review of the entire Nyx codebase.

**Architecture:** Nyx is a monorepo (npm workspaces) with three packages: `api` (Fastify 5 + better-sqlite3), `worker` (Playwright, TypeScript), `frontend` (React 19 + Vite). AES-256-GCM encrypts PII; key is derived via Argon2id from the user's master password and never stored.

**Tech Stack:** Node 20, TypeScript, Fastify 5, better-sqlite3 (SQLite WAL), Playwright + playwright-extra/stealth, React 19, Zustand, Tailwind CSS.

---

## Issues Found (read before implementing)

### CRITICAL — bugs that break functionality or security

| # | File | Issue |
|---|------|-------|
| C1 | `api/src/auth/routes.ts:88` | `secure: false` on session cookie — always sends over HTTP even in production |
| C2 | `worker/src/scheduler.ts:22` | `created_by = 'scheduler'` violates `REFERENCES users(id)` FK — scheduled scans **never run** |
| C3 | `worker/src/broker-runner.ts:82` | `confirmationPattern` from `awaiting_email` results is silently dropped — email checker matches on wrong heuristic |
| C4 | `worker/src/email-checker.ts:63` | Email checking requires a scan schedule key — profiles with email config but no schedule never get confirmed |

### MODERATE — performance, correctness, or misleading behavior

| # | File | Issue |
|---|------|-------|
| M1 | `api/src/routes/ws.ts:28-32` | N+1 DB queries in `broadcastPending()` — 2 extra queries per event, every 300ms |
| M2 | `api/src/routes/scans.ts:51` | `brokerIds` array spread into SQL with no size cap — potential DoS |
| M3 | `api/src/db/migrations/002_seed_brokers.sql` | `whitepages`/`radaris` seeded as `type='auto'` but scripts return `manual`; `fastpeoplesearch` IP-banned but `active=1` |
| M4 | `frontend/src/pages/Dashboard.tsx:25` | N+1 API calls — fetches `/opt-outs` for every profile sequentially |
| M5 | `worker/src/email-checker.ts:24` | Only checks `page_id=0` of SimpleLogin aliases — misses older aliases |
| M6 | `api/src/routes/simplelogin.ts:49` | `while(true)` with no page cap — can hang for users with thousands of aliases |

### MINOR — dead code, UX, or cleanup

| # | File | Issue |
|---|------|-------|
| N1 | `frontend/src/hooks/useWebSocket.ts` | Entire file is dead code — app uses `WebSocketContext.tsx` instead |
| N2 | `frontend/src/pages/Settings.tsx:107` | "Test API key" button creates a real SimpleLogin alias that is never deleted |
| N3 | `frontend/src/components/ScanModal.tsx:31` | Alias created on modal mount — orphaned if user cancels before submitting |
| N4 | `api/src/routes/profiles.ts:21` | `pii` accepted with no schema validation — malformed data silently encrypted |

---

## File Map

| Action | File |
|--------|------|
| Modify | `api/src/auth/routes.ts` |
| Modify | `api/src/routes/ws.ts` |
| Modify | `api/src/routes/scans.ts` |
| Modify | `api/src/routes/simplelogin.ts` |
| Modify | `api/src/routes/profiles.ts` |
| Create | `api/src/db/migrations/005_system_user.sql` |
| Create | `api/src/db/migrations/006_confirmation_pattern.sql` |
| Create | `api/src/db/migrations/007_fix_broker_types.sql` |
| Modify | `worker/src/scheduler.ts` |
| Modify | `worker/src/broker-runner.ts` |
| Modify | `worker/src/email-checker.ts` |
| Modify | `frontend/src/pages/Dashboard.tsx` |
| Modify | `frontend/src/pages/Settings.tsx` |
| Modify | `frontend/src/components/ScanModal.tsx` |
| Delete | `frontend/src/hooks/useWebSocket.ts` |

---

### Task 1: Fix session cookie `secure` flag (C1)

**Files:**
- Modify: `api/src/auth/routes.ts`

- [ ] **Step 1: Edit `api/src/auth/routes.ts` line 88**

Change `secure: false` to `secure: config.NODE_ENV === 'production'`:

```typescript
    return reply
      .setCookie('nyx_session', token, {
        httpOnly: true,
        sameSite: 'strict',
        secure:   config.NODE_ENV === 'production',
        path:     '/',
        maxAge:   8 * 3600,
      })
      .send({ id: user.id, email: user.email, role: user.role })
```

- [ ] **Step 2: Verify TypeScript still compiles**

Run: `cd /opt/claude/nyx && docker exec nyx-api npx tsc --noEmit 2>&1 | head -20`

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd /opt/claude/nyx && git add api/src/auth/routes.ts && git commit -m "fix: set session cookie secure=true in production"
```

---

### Task 2: Fix scheduler FK violation — scheduled scans never run (C2)

**Root cause:** `scan_jobs.created_by` has `REFERENCES users(id)` and `foreign_keys = ON`. The scheduler inserts `created_by = 'scheduler'` which is not a valid user ID → SQLite throws FK error → job is never inserted.

**Fix:** Add a system user migration; update scheduler to use its ID.

**Files:**
- Create: `api/src/db/migrations/005_system_user.sql`
- Modify: `worker/src/scheduler.ts`

- [ ] **Step 1: Create migration `005_system_user.sql`**

```sql
INSERT OR IGNORE INTO users (id, email, password_hash, role, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'system@nyx.internal',
  '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'user',
  '2024-01-01T00:00:00.000Z'
);
```

(The password_hash is a dummy — this account has no password and cannot log in.)

- [ ] **Step 2: Update `worker/src/scheduler.ts`**

Add the constant and use it:

```typescript
import { v4 as uuid } from 'uuid'
import type Database from 'better-sqlite3'

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000'

interface ScheduleRow {
  id: string
  profile_id: string
  interval_days: number
  next_run: string
  encrypted_schedule_key: string
}

export function runDueSchedules(db: Database.Database): void {
  const now = new Date().toISOString()

  const due = db.prepare(`
    SELECT * FROM scan_schedules WHERE enabled = 1 AND next_run <= ?
  `).all(now) as ScheduleRow[]

  for (const sched of due) {
    const jobId = uuid()
    db.prepare(`
      INSERT INTO scan_jobs (id, profile_id, broker_ids, status, encrypted_job_key, created_at, created_by)
      VALUES (?, ?, NULL, 'queued', ?, ?, ?)
    `).run(jobId, sched.profile_id, sched.encrypted_schedule_key, now, SYSTEM_USER_ID)

    const nextRun = new Date(Date.now() + sched.interval_days * 86400 * 1000).toISOString()
    db.prepare(`UPDATE scan_schedules SET next_run=?, last_run=? WHERE id=?`)
      .run(nextRun, now, sched.id)

    console.log(`[scheduler] Created job ${jobId} for profile ${sched.profile_id}`)
  }
}

export function startScheduler(db: Database.Database): void {
  runDueSchedules(db)
  setInterval(() => runDueSchedules(db), 60_000)
}
```

- [ ] **Step 3: Verify migration runs on API start**

Run: `docker restart nyx-api && docker logs nyx-api 2>&1 | grep migrate`

Expected: `[migrate] applied 005_system_user.sql`

- [ ] **Step 4: Test scheduled job creation**

```bash
docker exec nyx-api sqlite3 /data/nyx.db "SELECT id FROM users WHERE id='00000000-0000-0000-0000-000000000000';"
```

Expected: one row returned.

- [ ] **Step 5: Commit**

```bash
cd /opt/claude/nyx && git add api/src/db/migrations/005_system_user.sql worker/src/scheduler.ts && git commit -m "fix: use system user ID in scheduler to satisfy FK constraint on scan_jobs.created_by"
```

---

### Task 3: Store and use `confirmationPattern` for email matching (C3)

**Root cause:** `broker-runner.ts` line 82 checks `'reason' in result` and stores only the `reason` field. When `status === 'awaiting_email'`, the result has `confirmationPattern` (not `reason`) — it's silently dropped. The email checker then falls back to a loose broker_name regex.

**Fix:** Add `confirmation_pattern` column to `opt_out_requests`, store it from broker-runner, use it in email-checker.

**Files:**
- Create: `api/src/db/migrations/006_confirmation_pattern.sql`
- Modify: `worker/src/broker-runner.ts`
- Modify: `worker/src/email-checker.ts`

- [ ] **Step 1: Create migration `006_confirmation_pattern.sql`**

```sql
ALTER TABLE opt_out_requests ADD COLUMN confirmation_pattern TEXT;
```

- [ ] **Step 2: Update `worker/src/broker-runner.ts` — store confirmationPattern**

In the section that runs after the script returns (around line 69-83), replace the DB update block:

```typescript
      const confirmPattern = result.status === 'awaiting_email' ? result.confirmationPattern : null
      const notes = 'reason' in result ? result.reason : null

      db.prepare(`
        UPDATE opt_out_requests
        SET status = ?, last_attempt = ?, attempts = attempts + 1,
            submitted_at = CASE WHEN ? IN ('submitted','awaiting_email','confirmed') THEN ? ELSE submitted_at END,
            notes = ?,
            confirmation_pattern = COALESCE(?, confirmation_pattern)
        WHERE profile_id = ? AND broker_id = ?
      `).run(
        result.status, new Date().toISOString(),
        result.status, new Date().toISOString(),
        notes,
        confirmPattern,
        profileId, brokerId,
      )

      emitEvent(db, jobId, 'broker_done', { broker: brokerId, status: result.status, notes })
```

- [ ] **Step 3: Update `worker/src/email-checker.ts` — use stored pattern**

Update the inner query that fetches pending opt-outs to include `confirmation_pattern`:

```typescript
      const pending = db.prepare(`
        SELECT oor.*, b.name as broker_name FROM opt_out_requests oor
        JOIN brokers b ON b.id = oor.broker_id
        WHERE oor.profile_id = ? AND oor.status = 'awaiting_email'
      `).all(profileId) as Array<{ id: string; broker_name: string; confirmation_pattern: string | null }>
```

Update the matching logic to prefer the stored pattern:

```typescript
      for (const optOut of pending) {
        const pat = optOut.confirmation_pattern
          ? new RegExp(optOut.confirmation_pattern, 'i')
          : new RegExp(optOut.broker_name.toLowerCase().replace(/\s+/g, '.*'), 'i')
        for (const activity of emails.activities ?? []) {
          if (pat.test(activity.subject ?? '') || pat.test(activity.from_ ?? '')) {
            db.prepare(`UPDATE opt_out_requests SET status='confirmed', confirmed_at=? WHERE id=?`)
              .run(new Date().toISOString(), optOut.id)
            console.log(`[email-checker] Confirmed: ${optOut.broker_name} for profile ${profileId}`)
          }
        }
      }
```

- [ ] **Step 4: Verify migration applies**

Run: `docker restart nyx-api && docker logs nyx-api 2>&1 | grep migrate`

Expected: `[migrate] applied 006_confirmation_pattern.sql`

- [ ] **Step 5: Commit**

```bash
cd /opt/claude/nyx && git add api/src/db/migrations/006_confirmation_pattern.sql worker/src/broker-runner.ts worker/src/email-checker.ts && git commit -m "fix: persist confirmationPattern from broker scripts and use it in email checker"
```

---

### Task 4: Fix email-checker — remove schedule dependency + fix pagination (C4, M5)

**Root cause C4:** Email checker query requires `scan_schedules.encrypted_schedule_key` to decrypt email credentials. If no schedule exists, no email checking happens. The fix: use the most recent completed scan job's key instead.

**Root cause M5:** Only checks `page_id=0` of SimpleLogin activities — misses email activity for older aliases.

**Files:**
- Modify: `worker/src/email-checker.ts`

- [ ] **Step 1: Rewrite `startEmailChecker` in `worker/src/email-checker.ts`**

Replace the entire file with:

```typescript
import https from 'node:https'
import type Database from 'better-sqlite3'
import { decryptJobKey, decrypt, type EncryptedBlob } from './crypto/aes.js'
import { config } from './config.js'

function httpsGet(url: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

async function checkSimpleLogin(
  db: Database.Database,
  profileId: string,
  apiKey: string,
): Promise<void> {
  try {
    const pending = db.prepare(`
      SELECT oor.id, oor.confirmation_pattern, b.name as broker_name
      FROM opt_out_requests oor
      JOIN brokers b ON b.id = oor.broker_id
      WHERE oor.profile_id = ? AND oor.status = 'awaiting_email'
    `).all(profileId) as Array<{ id: string; broker_name: string; confirmation_pattern: string | null }>

    if (pending.length === 0) return

    let page = 0
    const MAX_PAGES = 20
    while (page < MAX_PAGES) {
      const response = await httpsGet(
        `https://app.simplelogin.io/api/aliases?page_id=${page}`,
        { 'Authentication': apiKey }
      ).catch(() => '{"aliases":[]}')

      const data = JSON.parse(response) as { aliases?: Array<{ id: number }> }
      const aliases = data.aliases ?? []
      if (aliases.length === 0) break

      for (const alias of aliases) {
        const emailsResp = await httpsGet(
          `https://app.simplelogin.io/api/aliases/${alias.id}/activities`,
          { 'Authentication': apiKey }
        ).catch(() => '{"activities":[]}')

        const emails = JSON.parse(emailsResp) as { activities?: Array<{ from_: string; subject?: string }> }

        for (const optOut of pending) {
          const pat = optOut.confirmation_pattern
            ? new RegExp(optOut.confirmation_pattern, 'i')
            : new RegExp(optOut.broker_name.toLowerCase().replace(/\s+/g, '.*'), 'i')
          for (const activity of emails.activities ?? []) {
            if (pat.test(activity.subject ?? '') || pat.test(activity.from_ ?? '')) {
              db.prepare(`UPDATE opt_out_requests SET status='confirmed', confirmed_at=? WHERE id=?`)
                .run(new Date().toISOString(), optOut.id)
              console.log(`[email-checker] Confirmed: ${optOut.broker_name} for profile ${profileId}`)
            }
          }
        }
      }
      page++
    }
  } catch (err) {
    console.error('[email-checker] SimpleLogin error:', err)
  }
}

export function startEmailChecker(db: Database.Database): void {
  const check = async () => {
    try {
      // Use the most recent completed scan job key — no longer requires a schedule
      const configs = db.prepare(`
        SELECT ec.profile_id, ec.encrypted_credentials, sj.encrypted_job_key
        FROM email_configs ec
        JOIN scan_jobs sj ON sj.id = (
          SELECT id FROM scan_jobs
          WHERE profile_id = ec.profile_id AND status = 'done'
          ORDER BY created_at DESC LIMIT 1
        )
        WHERE ec.provider = 'simplelogin'
      `).all() as Array<{ profile_id: string; encrypted_credentials: string; encrypted_job_key: string }>

      for (const cfg of configs) {
        try {
          const piiKey = decryptJobKey(cfg.encrypted_job_key, config.WORKER_SECRET)
          const credBlob: EncryptedBlob = JSON.parse(cfg.encrypted_credentials)
          const credentials = JSON.parse(decrypt(credBlob, piiKey)) as Record<string, string>
          if (credentials.apiKey) {
            await checkSimpleLogin(db, cfg.profile_id, credentials.apiKey)
          }
        } catch (err) {
          console.error(`[email-checker] Failed to check profile ${cfg.profile_id}:`, err)
        }
      }
    } catch (err) {
      console.error('[email-checker] Error:', err)
    }
  }

  check()
  setInterval(check, 5 * 60 * 1000)
}
```

- [ ] **Step 2: Rebuild and verify worker starts**

Run: `docker restart nyx-worker && docker logs nyx-worker 2>&1 | tail -10`

Expected: no crash, `[nyx-worker] ready` message

- [ ] **Step 3: Commit**

```bash
cd /opt/claude/nyx && git add worker/src/email-checker.ts && git commit -m "fix: email checker uses latest scan job key instead of schedule; add alias pagination"
```

---

### Task 5: Fix broker type seeds (M3)

**Root cause:** Migration 002 seeds `whitepages` and `radaris` as `type='auto'` but both scripts now return `manual` immediately. `fastpeoplesearch` is IP-banned but stays `active=1`, wasting time in every scan.

**Fix:** New migration to correct the types.

**Files:**
- Create: `api/src/db/migrations/007_fix_broker_types.sql`

- [ ] **Step 1: Create `007_fix_broker_types.sql`**

```sql
-- These scripts return 'manual' immediately — use 'semi' so they still run and surface the manual guide
UPDATE brokers SET type = 'semi' WHERE id IN ('whitepages', 'radaris');

-- fastpeoplesearch is Cloudflare IP-banned — disable to avoid wasting scan time
UPDATE brokers SET active = 0 WHERE id = 'fastpeoplesearch';
```

- [ ] **Step 2: Apply migration**

Run: `docker restart nyx-api && docker logs nyx-api 2>&1 | grep migrate`

Expected: `[migrate] applied 007_fix_broker_types.sql`

- [ ] **Step 3: Verify in DB**

```bash
docker exec nyx-api sqlite3 /data/nyx.db "SELECT id, type, active FROM brokers WHERE id IN ('whitepages','radaris','fastpeoplesearch');"
```

Expected: whitepages/radaris `semi|1`, fastpeoplesearch `auto|0`

- [ ] **Step 4: Commit**

```bash
cd /opt/claude/nyx && git add api/src/db/migrations/007_fix_broker_types.sql && git commit -m "fix: whitepages/radaris type=semi (manual scripts), disable fastpeoplesearch (IP banned)"
```

---

### Task 6: Fix N+1 queries in WebSocket broadcast loop (M1)

**Root cause:** `broadcastPending()` loops over up to 50 events, doing 2 DB queries per event (scan_jobs + profiles) = up to 100 extra queries every 300ms.

**Fix:** Single JOIN query fetches all necessary data at once.

**Files:**
- Modify: `api/src/routes/ws.ts`

- [ ] **Step 1: Replace `broadcastPending()` in `api/src/routes/ws.ts`**

Replace the function body (lines 18-52):

```typescript
function broadcastPending(): void {
  if (clients.size === 0) return

  const db = getDb()
  const rows = db.prepare(`
    SELECT se.id, se.job_id, se.event_type, se.payload,
           p.user_id
    FROM scan_events se
    JOIN scan_jobs sj ON sj.id = se.job_id
    JOIN profiles p ON p.id = sj.profile_id
    WHERE se.broadcast = 0
    ORDER BY se.created_at
    LIMIT 50
  `).all() as (ScanEventRow & { user_id: string })[]

  if (rows.length === 0) return

  for (const event of rows) {
    const message = JSON.stringify({
      type:    event.event_type,
      jobId:   event.job_id,
      payload: JSON.parse(event.payload),
    })

    for (const client of clients) {
      if (client.user.role === 'admin' || client.user.id === event.user_id) {
        try { client.ws.send(message) } catch { /* client disconnected */ }
      }
    }
  }

  const ids = rows.map(e => e.id)
  db.prepare(
    `UPDATE scan_events SET broadcast = 1 WHERE id IN (${ids.map(() => '?').join(',')})`
  ).run(...ids)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `docker exec nyx-api npx tsc --noEmit 2>&1 | head -20`

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd /opt/claude/nyx && git add api/src/routes/ws.ts && git commit -m "perf: replace N+1 queries in broadcastPending with single JOIN query"
```

---

### Task 7: Fix unbounded `brokerIds` array (M2)

**Root cause:** `POST /scans` accepts arbitrary `brokerIds[]` with no maximum length. A request with 10,000 items causes 10,000 DB inserts and a massive SQL `IN (...)` clause.

**Files:**
- Modify: `api/src/routes/scans.ts`

- [ ] **Step 1: Add size check in `api/src/routes/scans.ts`**

After the `if (!profileId || !password)` check (around line 29), add:

```typescript
    if (brokerIds !== undefined && (!Array.isArray(brokerIds) || brokerIds.length > 100)) {
      return reply.code(400).send({ error: 'brokerIds must be an array of at most 100 items' })
    }
```

- [ ] **Step 2: Commit**

```bash
cd /opt/claude/nyx && git add api/src/routes/scans.ts && git commit -m "fix: cap brokerIds array at 100 items to prevent DoS"
```

---

### Task 8: Add PII schema validation (N4)

**Root cause:** `POST /profiles` and `PATCH /profiles/:id` accept any `pii` object and encrypt it without validation. A malformed PII (missing firstName, wrong dob format) gets stored and later causes worker scripts to crash with cryptic errors.

**Files:**
- Modify: `api/src/routes/profiles.ts`

- [ ] **Step 1: Add Zod PII schema at top of `api/src/routes/profiles.ts`**

After the imports, add:

```typescript
import { z } from 'zod'

const AddressSchema = z.object({
  street:  z.string().min(1).max(200),
  city:    z.string().min(1).max(100),
  state:   z.string().max(50).optional(),
  zip:     z.string().max(20).optional(),
  country: z.string().length(2),
})

const PiiSchema = z.object({
  firstName:         z.string().min(1).max(100),
  lastName:          z.string().min(1).max(100),
  dob:               z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dob must be YYYY-MM-DD'),
  email:             z.string().email().optional(),
  phone:             z.string().max(30).optional(),
  aliases:           z.array(z.string().max(100)).max(10).optional(),
  currentAddress:    AddressSchema,
  previousAddresses: z.array(AddressSchema).max(5).optional(),
})
```

- [ ] **Step 2: Use PiiSchema in `POST /profiles`**

After the `if (!label || !password || !pii)` check, add:

```typescript
    const piiParsed = PiiSchema.safeParse(pii)
    if (!piiParsed.success) {
      return reply.code(400).send({ error: 'Invalid PII', details: piiParsed.error.flatten() })
    }
    const validPii = piiParsed.data
```

Then use `validPii` instead of `pii` in the `encrypt(JSON.stringify(pii), ...)` call:

```typescript
    const blob = encrypt(JSON.stringify(validPii), key, salt)
```

- [ ] **Step 3: Use PiiSchema in `PATCH /profiles/:id`**

In the `if (pii)` branch, add validation before re-encrypting:

```typescript
    if (pii) {
      const piiParsed = PiiSchema.safeParse(pii)
      if (!piiParsed.success) {
        return reply.code(400).send({ error: 'Invalid PII', details: piiParsed.error.flatten() })
      }
      const salt = generateSalt()
      const key  = await deriveKey(password, salt)
      const blob = encrypt(JSON.stringify(piiParsed.data), key, salt)
      db.prepare('UPDATE profiles SET encrypted_pii = ?, label = COALESCE(?, label) WHERE id = ?')
        .run(JSON.stringify(blob), label ?? null, id)
```

- [ ] **Step 4: Verify zod is already in api/package.json**

Run: `grep '"zod"' /opt/claude/nyx/api/package.json`

Expected: `"zod": "..."` (it is — used by config.ts already)

- [ ] **Step 5: Verify TypeScript compiles**

Run: `docker exec nyx-api npx tsc --noEmit 2>&1 | head -20`

Expected: no errors

- [ ] **Step 6: Commit**

```bash
cd /opt/claude/nyx && git add api/src/routes/profiles.ts && git commit -m "fix: validate PII structure with Zod before encrypting in profile create/update"
```

---

### Task 9: Fix SimpleLogin pagination cap (M6)

**Root cause:** `POST /simplelogin/aliases/nyx` loops with `while(true)` over all pages with no maximum. A user with thousands of aliases will cause this request to run for minutes.

**Files:**
- Modify: `api/src/routes/simplelogin.ts`

- [ ] **Step 1: Add page cap to `POST /simplelogin/aliases/nyx`**

Replace `while (true)` with `while (page < 50)` and add `if (page >= 50) break` after the aliases check:

```typescript
    let page = 0
    while (page < 50) {
      const res = await fetch(`${SL_BASE}/aliases?page_id=${page}`, {
        headers: { Authentication: apiKey },
      }).catch(() => null)

      if (!res || !res.ok) break
      const data = await res.json() as { aliases?: { id: number; email: string; note?: string | null }[] }
      const aliases = data.aliases ?? []
      if (aliases.length === 0) break

      for (const a of aliases) {
        if (a.note?.startsWith('nyx')) {
          nyxAliases.push({ id: a.id, alias: a.email })
        }
      }
      page++
    }
```

- [ ] **Step 2: Commit**

```bash
cd /opt/claude/nyx && git add api/src/routes/simplelogin.ts && git commit -m "fix: cap SimpleLogin alias listing at 50 pages to prevent indefinite loops"
```

---

### Task 10: Fix Dashboard N+1 — parallel opt-out fetching (M4)

**Root cause:** `Dashboard.tsx` calls `api.optOuts.forProfile(p.id)` for each profile **sequentially** inside `Promise.all`. With 5 profiles this is 5 sequential HTTP requests.

**Fix:** The calls are already inside `Promise.all` via `.map()` — actually checking again, it IS parallel since `.map()` inside `Promise.all` creates all promises at once. But the Dashboard also does a separate `/scans` fetch that is not correlated. The bigger issue is that every profile is fetched individually.

**Actually:** Re-reading the code at lines 25-29:
```typescript
const statsArr = await Promise.all(
  ps.map(async p => ({
    profile: p,
    optOuts: (await api.optOuts.forProfile(p.id).catch(() => [])) as OptOutRequest[],
  }))
)
```
This **is** parallel (`Promise.all` over `.map`). The issue here is that with N profiles, we make N HTTP requests. This is acceptable for small N (personal tool).

**The real issue** is the missing `profile_label` in scan list and the all-scans fetch in ProfileDetail. Let me focus on the ProfileDetail issue which fetches ALL scans globally:

**Files:**
- Modify: `api/src/routes/scans.ts` (add GET /profiles/:id/scans)
- Modify: `api/src/client.ts` (add profiles.scans)
- Modify: `frontend/src/pages/ProfileDetail.tsx`

- [ ] **Step 1: Add `GET /profiles/:id/scans` endpoint in `api/src/routes/scans.ts`**

Inside `registerScanRoutes`, add after the existing `GET /scans` route:

```typescript
  app.get('/profiles/:id/scans', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()

    const profile = db.prepare('SELECT user_id FROM profiles WHERE id = ?').get(id) as { user_id: string } | undefined
    if (!profile) return reply.code(404).send({ error: 'Profile not found' })
    if (req.user.role !== 'admin' && profile.user_id !== req.user.id) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const jobs = db.prepare(`
      SELECT id, profile_id, status, confirmation_email, simplelogin_alias_id,
             created_at, started_at, finished_at
      FROM scan_jobs
      WHERE profile_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(id) as ScanJobRow[]

    return reply.send(jobs)
  })
```

- [ ] **Step 2: Add `profiles.scans` to `frontend/src/api/client.ts`**

In the `profiles` section, add:

```typescript
    scans: (id: string) => req<ScanJob[]>('GET', `/profiles/${id}/scans`),
```

You'll need to import `ScanJob` at the top — add it to the existing import or use `unknown`:

```typescript
import type { ScanJob } from '../types.js'
```

- [ ] **Step 3: Update `frontend/src/pages/ProfileDetail.tsx`**

Replace `api.scans.list()` with `api.profiles.scans(id)` in the `load` function (line ~35):

```typescript
  const load = async () => {
    if (!id) return
    try {
      const [p, oo, scans] = await Promise.all([
        api.profiles.get(id) as Promise<Profile>,
        api.optOuts.forProfile(id).catch(() => []) as Promise<OptOutRequest[]>,
        (api.profiles as unknown as { scans: (id: string) => Promise<ScanJob[]> }).scans(id).catch(() => []),
      ])
      setProfile(p)
      setOptOuts(oo)
      setJobs(scans)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }
```

(Remove the old `.filter(j => j.profile_id === id)` since the new endpoint already filters.)

- [ ] **Step 4: Verify TypeScript compiles in frontend**

Run: `cd /opt/claude/nyx/frontend && npx tsc --noEmit 2>&1 | head -20`

Expected: no errors

- [ ] **Step 5: Commit**

```bash
cd /opt/claude/nyx && git add api/src/routes/scans.ts frontend/src/api/client.ts frontend/src/pages/ProfileDetail.tsx && git commit -m "fix: ProfileDetail fetches own scans via /profiles/:id/scans instead of global list"
```

---

### Task 11: Remove dead code + fix alias leaks (N1, N2, N3)

**Root cause N1:** `frontend/src/hooks/useWebSocket.ts` is a duplicate implementation — never imported by any component (the app uses `WebSocketContext.tsx`).

**Root cause N2:** Settings "Test" button creates a real SimpleLogin alias with note "nyx api key test" but never deletes it.

**Root cause N3:** `ScanModal` creates an alias in `useEffect([], [])` on mount, before the user confirms. If the user clicks Cancel, the alias is orphaned.

**Files:**
- Delete: `frontend/src/hooks/useWebSocket.ts`
- Modify: `frontend/src/pages/Settings.tsx`
- Modify: `frontend/src/components/ScanModal.tsx`

- [ ] **Step 1: Delete dead hook**

```bash
rm /opt/claude/nyx/frontend/src/hooks/useWebSocket.ts
```

- [ ] **Step 2: Fix `Settings.tsx` test — delete alias after test**

In `testSlKey`, after a successful test (around line 116), add a deletion call before updating state:

```typescript
  const testSlKey = async () => {
    const key = slKey.trim()
    if (!key) return
    setSlTest('loading')
    setSlTestMsg('')
    try {
      const res = await fetch('/simplelogin/alias', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key, note: 'nyx api key test' }),
      })
      const data = await res.json() as { alias?: string; aliasId?: number | null; error?: string }
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)

      // Clean up the test alias immediately
      if (data.aliasId) {
        await api.simplelogin.deleteAlias(key, data.aliasId).catch(() => {})
      }

      setSlTest('ok')
      setSlTestMsg(data.alias ?? 'Alias created and deleted (key is valid)')
    } catch (err) {
      setSlTest('error')
      setSlTestMsg(err instanceof Error ? err.message : 'Test failed')
    }
  }
```

- [ ] **Step 3: Fix `ScanModal.tsx` — delete alias on cancel**

In `ScanModal`, add a cleanup function and call it on cancel:

Add `aliasStateRef` to track the alias for cleanup:

```typescript
  const aliasCreatedRef = useRef<{ alias: string; aliasId: number } | null>(null)

  useEffect(() => {
    passwordRef.current?.focus()
    if (!hasSLKey) return

    const key = localStorage.getItem(SL_KEY)!.trim()
    setAliasState({ status: 'loading' })
    api.simplelogin.createAlias(key, `nyx opt-out — ${profileLabel}`)
      .then(({ alias, aliasId }) => {
        setAliasState({ status: 'ok', alias, aliasId })
        if (aliasId) aliasCreatedRef.current = { alias, aliasId }
      })
      .catch(err => setAliasState({ status: 'error', message: err instanceof Error ? err.message : String(err) }))
  }, [])

  const handleCancel = () => {
    // If alias was created but scan wasn't submitted, clean it up
    const created = aliasCreatedRef.current
    if (created?.aliasId) {
      const key = localStorage.getItem(SL_KEY)?.trim()
      if (key) api.simplelogin.deleteAlias(key, created.aliasId).catch(() => {})
    }
    onCancel()
  }
```

Replace the Cancel button's `onClick` from `onCancel` to `handleCancel`:

```tsx
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 px-4 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-800 transition text-sm"
            >
              Cancel
            </button>
```

Also clear `aliasCreatedRef` on successful submit so cancel after submit doesn't delete it:

```typescript
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    setSubmitting(true)
    setError('')
    try {
      await onConfirm(password, effectiveEmail, effectiveAliasId)
      aliasCreatedRef.current = null  // submitted successfully — don't clean up
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
      setSubmitting(false)
    }
  }
```

- [ ] **Step 4: Verify no remaining imports of `useWebSocket`**

```bash
grep -r "useWebSocket" /opt/claude/nyx/frontend/src/ --include="*.tsx" --include="*.ts"
```

Expected: no results (or only in a file that's also being deleted)

- [ ] **Step 5: Build frontend**

Run: `cd /opt/claude/nyx/frontend && npm run build 2>&1 | tail -20`

Expected: build succeeds with no errors

- [ ] **Step 6: Commit**

```bash
cd /opt/claude/nyx && git add -A frontend/src/ && git commit -m "fix: delete dead useWebSocket hook; clean up test aliases in Settings; delete ScanModal alias on cancel"
```

---

## Self-Review

### Spec coverage
- [x] C1: session cookie secure — Task 1
- [x] C2: scheduler FK violation — Task 2
- [x] C3: confirmationPattern dropped — Task 3
- [x] C4: email-checker requires schedule — Task 4
- [x] M1: N+1 in broadcastPending — Task 6
- [x] M2: brokerIds unbounded — Task 7
- [x] M3: broker types mismatch — Task 5
- [x] M4: ProfileDetail fetches all scans — Task 10
- [x] M5: email-checker page=0 only — Task 4
- [x] M6: simplelogin while(true) — Task 9
- [x] N1: dead useWebSocket hook — Task 11
- [x] N2: test alias never deleted — Task 11
- [x] N3: ScanModal alias orphaned — Task 11
- [x] N4: no PII validation — Task 8

### Known non-issues (looked scary, investigated)
- **Cascade deletes**: All child tables have `ON DELETE CASCADE` on `profile_id` — no action needed.
- **AES salt in encryptKeyForWorker**: Salt stored in blob but not used in key derivation — misleading but not a security flaw since AES-GCM uses a random IV.
- **WS `clients` Set global**: Fine for single instance; horizontal scaling is not a current concern.
- **JWT 8h expiry on WS**: Acceptable for a self-hosted personal tool.
- **Stats in GET /scans**: Returns profile-level aggregate stats, not per-scan stats. Acceptable as "current status of this profile's brokers" — no action.
