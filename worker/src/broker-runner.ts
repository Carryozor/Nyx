import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import path from 'node:path'
import fs from 'node:fs'
import type Database from 'better-sqlite3'
import { emitEvent } from './event-emitter.js'
import { config } from './config.js'
import { bypassCloudflare, hasCaptcha } from './scripts/_helpers.js'
import { sendGdprEmail } from './gdpr-email.js'
import type { DecryptedPII, OptOutResult } from './scripts/_types.js'

chromium.use(StealthPlugin())

const SCRIPT_FILE_RE = /^[a-z0-9_-]+\.js$/i
const SCRIPT_DIR = new URL('./scripts/', import.meta.url).pathname
// Global per-attempt budget. Must comfortably exceed the sum of a script's own
// internal timeouts (goto 30s + isVisible 10s + screenshots + delays); 60s was
// too tight and killed legitimately-slow runs mid-flight.
const TIMEOUT_MS = 120_000
const MAX_RETRIES = 3
// Heavy assets delay DOMContentLoaded on ad-laden broker pages (privatereports,
// addresses, …), pushing scripts past the global timeout. Blocking them cut goto
// from ~60s to ~1.5s in testing. Stylesheets are deliberately NOT blocked so
// Playwright visibility checks keep working.
const BLOCKED_RESOURCE_TYPES = new Set(['image', 'media', 'font'])

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
  const brokerRow = db.prepare('SELECT name, script_file, manual_guide, opt_out_email, gdpr_lang, audience FROM brokers WHERE id=?').get(brokerId) as { name: string; script_file: string | null; manual_guide: string | null; opt_out_email: string | null; gdpr_lang: string | null; audience: 'private' | 'professional' | 'both' | null } | undefined

  // GDPR email-based brokers: send the Article 17 erasure email — no browser needed.
  if (brokerRow && brokerRow.opt_out_email) {
    const result = await sendGdprEmail(
      { id: brokerId, name: brokerRow.name, opt_out_email: brokerRow.opt_out_email, gdpr_lang: brokerRow.gdpr_lang, audience: brokerRow.audience },
      pii,
      pii.email,
    )
    const confirmationPattern = result.status === 'awaiting_email' ? result.confirmationPattern : null
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
      notes, confirmationPattern,
      profileId, brokerId,
    )
    // Mail budget is reserved at scan creation (API), so no logging here.
    emitEvent(db, jobId, 'broker_done', { broker: brokerId, status: result.status, notes })
    return result
  }

  // Brokers with no script_file are manual-only — skip automation entirely
  if (brokerRow && brokerRow.script_file === null) {
    const result: OptOutResult = { status: 'manual', reason: brokerRow.manual_guide ? undefined : `No automation script for ${brokerId} — opt out manually` }
    db.prepare(`UPDATE opt_out_requests SET status='manual', last_attempt=?, attempts=attempts+1, notes=? WHERE profile_id=? AND broker_id=?`)
      .run(new Date().toISOString(), 'reason' in result ? result.reason ?? null : null, profileId, brokerId)
    return result
  }

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
        ignoreHTTPSErrors: true,
      })

      // Block heavy assets to keep navigations fast and within the timeout budget.
      await context.route('**/*', route => {
        if (BLOCKED_RESOURCE_TYPES.has(route.request().resourceType())) return route.abort()
        return route.continue()
      })

      const page = await context.newPage()

      // Transparently route every script navigation through a Cloudflare check:
      // if the landing page is a bot challenge, solve it via FlareSolverr and retry.
      // This wires bypassCloudflare into all 55 scripts without editing each one.
      const nativeGoto = page.goto.bind(page)
      page.goto = async (url, options) => {
        const response = await nativeGoto(url, options)
        const blockedStatus = response !== null && [403, 429, 503].includes(response.status())
        if (blockedStatus || await hasCaptcha(page)) {
          const solved = await bypassCloudflare(page, url)
          if (solved) return nativeGoto(url, options)
        }
        return response
      }

      emitEvent(db, jobId, 'progress', { broker: brokerId, attempt, phase: 'starting' })

      let timeoutHandle: ReturnType<typeof setTimeout> | null = null
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('Script timeout')), TIMEOUT_MS)
      })

      let result: OptOutResult
      try {
        result = await Promise.race([
          script({ page, pii, screenshotDir, brokerId, profileId, db }),
          timeoutPromise,
        ])
      } finally {
        // Always clear the timeout and close the browser — this prevents
        // the orphaned script from sending CDP commands to a closed browser,
        // which would throw uncaughtException and kill the worker process.
        if (timeoutHandle !== null) clearTimeout(timeoutHandle)
        try { await browser.close() } catch { /* ignore close errors */ }
        browser = undefined
      }

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
      if (browser) { try { await browser.close() } catch { /* ignore */ } }
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
