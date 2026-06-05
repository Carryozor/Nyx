/**
 * Shared opt-out logic for the PeopleConnect family of brokers:
 * BeenVerified, TruthFinder, InstantCheckmate, Intelius, PeopleSmart,
 * ZabaSearch, USSearch, CheckPeople, PeopleLooker, NeighborWho, iSearch.
 *
 * ALL these brokers share a single Suppression Center at
 * suppression.peopleconnect.us/login — one submission opts you out of all.
 *
 * To avoid rate-limiting (PeopleConnect blocks repeated submissions from the
 * same IP), we submit only ONCE per scan: if another PeopleConnect broker
 * for this profile already has awaiting_email status, we skip the form and
 * inherit the same confirmation pattern directly.
 */
import type { Page } from '@playwright/test'
import type Database from 'better-sqlite3'
import type { DecryptedPII, OptOutResult } from './_types.js'
import { humanDelay, screenshot, hasCaptcha, sleep } from './_helpers.js'

const PEOPLECONNECT_BROKERS = [
  'beenverified', 'checkpeople', 'instantcheckmate', 'intelius',
  'isearch', 'neighborwho', 'peoplelooker', 'peoplesmartus',
  'truthfinder', 'ussearch', 'zabasearch',
]

interface PeopleConnectConfig {
  emailPattern:  string
  screenshotDir: string
  searchUrl?:    string
}

export async function peopleConnectOptOut(
  page:      Page,
  _pii:      DecryptedPII,
  email:     string,
  cfg:       PeopleConnectConfig,
  profileId: string,
  db:        Database.Database,
): Promise<OptOutResult> {
  const { emailPattern, screenshotDir } = cfg

  // ── Deduplication guard ──────────────────────────────────────────────────
  // Only skip if another PeopleConnect broker was submitted in the LAST 30 MINUTES
  // (i.e. within the current scan). Avoids re-using stale awaiting_email from old scans.
  const alreadySubmitted = db.prepare(`
    SELECT status FROM opt_out_requests
    WHERE profile_id = ?
      AND broker_id IN (${PEOPLECONNECT_BROKERS.map(() => '?').join(',')})
      AND status = 'awaiting_email'
      AND last_attempt > datetime('now', '-30 minutes')
    LIMIT 1
  `).get(profileId, ...PEOPLECONNECT_BROKERS) as { status: string } | undefined

  if (alreadySubmitted) {
    return { status: 'awaiting_email', confirmationPattern: emailPattern }
  }

  // ── Submit to suppression centre ─────────────────────────────────────────
  await page.goto('https://suppression.peopleconnect.us/login', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await humanDelay()

  if (await hasCaptcha(page)) {
    return { status: 'failed', reason: 'CAPTCHA on PeopleConnect suppression centre' }
  }

  const emailInput = page.locator('input[name="login-email"], input[type="email"]').first()
  const formReady  = await emailInput
    .waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true)
    .catch(() => false)

  if (!formReady) {
    await screenshot(page, screenshotDir, 'no-form')
    return { status: 'failed', reason: 'PeopleConnect suppression form did not appear' }
  }

  await emailInput.fill(email)
  await humanDelay(400, 800)

  // Accept TOS — checkbox may be styled/hidden
  const consentBox = page.locator('input[name="consent"], input[type="checkbox"]').first()
  if (await consentBox.count() > 0) {
    await consentBox.check({ force: true }).catch(() => {})
    await humanDelay(200, 400)
  }

  await screenshot(page, screenshotDir, 'form-filled')

  const continueBtn = page.locator(
    'button:has-text("Continue"), input[type="submit"], button[type="submit"]'
  ).first()
  if (!(await continueBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
    await screenshot(page, screenshotDir, 'no-continue-btn')
    return { status: 'failed', reason: 'Continue button not found on PeopleConnect suppression form' }
  }

  await continueBtn.click()
  await sleep(3000)

  if (await hasCaptcha(page)) {
    return { status: 'failed', reason: 'CAPTCHA after submitting email to suppression centre' }
  }

  await screenshot(page, screenshotDir, 'submitted')

  // ── Detect errors on the page after submission ───────────────────────────
  const bodyText = (await page.textContent('body').catch(() => '') ?? '').toLowerCase()

  const errorPatterns = [
    /something went wrong/i,
    /please try again/i,
    /error occurred/i,
    /unable to process/i,
    /request failed/i,
    /too many requests/i,
    /rate limit/i,
  ]

  for (const pattern of errorPatterns) {
    if (pattern.test(bodyText)) {
      await screenshot(page, screenshotDir, 'error-page')
      return {
        status: 'failed',
        reason: `PeopleConnect suppression centre returned an error: "${
          bodyText.match(pattern)?.[0] ?? 'unknown error'
        }" — le portail peut avoir détecté une automatisation ou appliqué un rate-limit. Réessayez plus tard ou soumettez manuellement sur suppression.peopleconnect.us`,
      }
    }
  }

  // Success indicators
  const successPatterns = [
    /check your email/i,
    /email.*sent/i,
    /verification.*link/i,
    /we.*sent/i,
    /confirm.*email/i,
  ]
  const isSuccess = successPatterns.some(p => p.test(bodyText))

  if (!isSuccess) {
    // Page didn't clearly succeed — take screenshot for debugging
    await screenshot(page, screenshotDir, 'ambiguous-result')
  }

  return { status: 'awaiting_email', confirmationPattern: emailPattern }
}
