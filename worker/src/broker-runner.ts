import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import path from 'node:path'
import fs from 'node:fs'
import type Database from 'better-sqlite3'
import { emitEvent } from './event-emitter.js'
import { config } from './config.js'
import type { DecryptedPII, OptOutResult } from './scripts/_types.js'

chromium.use(StealthPlugin())

const SCRIPT_FILE_RE = /^[a-z0-9_-]+\.js$/i
const SCRIPT_DIR = new URL('./scripts/', import.meta.url).pathname
const TIMEOUT_MS = 60_000
const MAX_RETRIES = 3

async function loadScript(scriptFile: string) {
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

export async function runBroker(
  db: Database.Database,
  jobId: string,
  profileId: string,
  brokerId: string,
  pii: DecryptedPII,
): Promise<OptOutResult> {
  const screenshotDir = path.join(config.SCREENSHOT_DIR, jobId, brokerId)

  // Use broker's script_file from DB when it differs from the broker ID
  const brokerRow = db.prepare('SELECT script_file FROM brokers WHERE id=?').get(brokerId) as { script_file: string | null } | undefined
  const scriptFile = brokerRow?.script_file ?? `${brokerId}.js`
  fs.mkdirSync(screenshotDir, { recursive: true })

  const script = await loadScript(scriptFile)
  let lastError = ''

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let browser
    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
      })
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'America/New_York',
        viewport: { width: 1280, height: 800 },
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

      const confirmationPattern = result.status === 'awaiting_email' ? result.confirmationPattern : null
      const notes = 'reason' in result ? result.reason : null

      db.prepare(`
        UPDATE opt_out_requests
        SET status = ?, last_attempt = ?, attempts = attempts + 1,
            submitted_at = CASE WHEN ? IN ('submitted','awaiting_email','confirmed') THEN ? ELSE submitted_at END,
            notes = ?,
            confirmation_pattern = COALESCE(?, confirmation_pattern),
            screenshot = ?
        WHERE profile_id = ? AND broker_id = ?
      `).run(
        result.status, new Date().toISOString(),
        result.status, new Date().toISOString(),
        notes,
        confirmationPattern,
        jobId,
        profileId, brokerId,
      )

      emitEvent(db, jobId, 'broker_done', { broker: brokerId, status: result.status, notes })
      return result

    } catch (err) {
      lastError = String(err)
      await browser?.close().catch(() => {})
      if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, attempt * 2000))
    }
  }

  const failReason = `After ${MAX_RETRIES} attempts: ${lastError}`
  const failed: OptOutResult = { status: 'failed', reason: failReason }
  db.prepare(`
    UPDATE opt_out_requests SET status='failed', last_attempt=?, attempts=attempts+1, notes=?
    WHERE profile_id=? AND broker_id=?
  `).run(new Date().toISOString(), failReason, profileId, brokerId)

  emitEvent(db, jobId, 'broker_done', { broker: brokerId, status: 'failed', notes: failReason })
  return failed
}
