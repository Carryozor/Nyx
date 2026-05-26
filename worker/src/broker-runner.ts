import { chromium } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import type Database from 'better-sqlite3'
import { emitEvent } from './event-emitter.js'
import { config } from './config.js'
import type { DecryptedPII, OptOutResult } from './scripts/_types.js'

const SCRIPT_DIR = new URL('./scripts/', import.meta.url).pathname
const TIMEOUT_MS = 60_000
const MAX_RETRIES = 3

async function loadScript(brokerId: string) {
  const scriptPath = path.join(SCRIPT_DIR, `${brokerId}.js`)
  if (fs.existsSync(scriptPath)) {
    const mod = await import(scriptPath) as { run: (ctx: unknown) => Promise<OptOutResult> }
    return mod.run
  }
  const stub = await import('./scripts/_stub.js') as { run: (ctx: unknown) => Promise<OptOutResult> }
  return stub.run
}

export async function runBroker(
  db: Database.Database,
  jobId: string,
  profileId: string,
  brokerId: string,
  pii: DecryptedPII,
): Promise<OptOutResult> {
  const screenshotDir = path.join(config.SCREENSHOT_DIR, jobId, brokerId)
  fs.mkdirSync(screenshotDir, { recursive: true })

  const script = await loadScript(brokerId)
  let lastError = ''

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let browser
    try {
      browser = await chromium.launch({ headless: true })
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      })
      const page = await context.newPage()

      emitEvent(db, jobId, 'progress', { broker: brokerId, attempt, phase: 'starting' })

      const result = await Promise.race([
        script({ page, pii, screenshotDir, brokerId }),
        new Promise<OptOutResult>((_, reject) =>
          setTimeout(() => reject(new Error('Script timeout')), TIMEOUT_MS)
        ),
      ])

      await browser.close()

      db.prepare(`
        UPDATE opt_out_requests
        SET status = ?, last_attempt = ?, attempts = attempts + 1,
            submitted_at = CASE WHEN ? IN ('submitted','awaiting_email','confirmed') THEN ? ELSE submitted_at END,
            notes = ?
        WHERE profile_id = ? AND broker_id = ?
      `).run(
        result.status, new Date().toISOString(),
        result.status, new Date().toISOString(),
        'reason' in result ? result.reason : null,
        profileId, brokerId,
      )

      emitEvent(db, jobId, 'broker_done', { broker: brokerId, status: result.status })
      return result

    } catch (err) {
      lastError = String(err)
      await browser?.close().catch(() => {})
      if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, attempt * 2000))
    }
  }

  const failed: OptOutResult = { status: 'failed', reason: `After ${MAX_RETRIES} attempts: ${lastError}` }
  db.prepare(`
    UPDATE opt_out_requests SET status='failed', last_attempt=?, attempts=attempts+1, notes=?
    WHERE profile_id=? AND broker_id=?
  `).run(new Date().toISOString(), failed.reason, profileId, brokerId)

  emitEvent(db, jobId, 'broker_done', { broker: brokerId, status: 'failed' })
  return failed
}
