import type { Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import type { DecryptedPII, OptOutResult } from './_types.js'

interface FlareSolverrCookie {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: string
}

interface FlareSolverrResponse {
  status: string
  solution?: {
    cookies: FlareSolverrCookie[]
    userAgent: string
    response: string
  }
}

/**
 * Use FlareSolverr to obtain valid Cloudflare clearance cookies for a domain,
 * then inject them into the Playwright context so subsequent navigations bypass
 * the Cloudflare bot-protection challenge.
 *
 * Returns true on success, false if FlareSolverr is unavailable or the solve fails.
 */
export async function bypassCloudflare(page: Page, url: string): Promise<boolean> {
  const fsBase = (process.env.FLARESOLVERR_URL ?? 'http://flaresolverr:8191').replace(/\/$/, '')
  try {
    const res = await fetch(`${fsBase}/v1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'request.get', url, maxTimeout: 60000 }),
      signal: AbortSignal.timeout(70000),
    })
    if (!res.ok) return false

    const data = await res.json() as FlareSolverrResponse
    if (data.status !== 'ok' || !data.solution) return false

    const { cookies, userAgent } = data.solution

    // Inject the solved cookies (cf_clearance etc.) into the Playwright context
    await page.context().addCookies(
      cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
        path: c.path || '/',
        ...(c.expires > 0 ? { expires: c.expires } : {}),
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: (['Strict', 'Lax', 'None'].includes(c.sameSite)
          ? c.sameSite
          : 'Lax') as 'Strict' | 'Lax' | 'None',
      })),
    )

    // Use the same user agent that passed the challenge
    await page.setExtraHTTPHeaders({ 'User-Agent': userAgent })

    return true
  } catch {
    return false
  }
}

export async function setup(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-Mode': 'navigate',
  })
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

export async function humanDelay(min = 600, max = 1600): Promise<void> {
  await sleep(min + Math.random() * (max - min))
}

export async function screenshot(page: Page, dir: string, name: string): Promise<void> {
  try {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false })
  } catch { /* non-fatal */ }
}

export function requireEmail(pii: DecryptedPII): string | OptOutResult {
  if (pii.email) return pii.email
  return { status: 'failed', reason: 'no confirmation email configured — required for this broker' }
}

export async function hasCaptcha(page: Page): Promise<boolean> {
  const url = page.url()
  if (/captcha|challenge|recaptcha|hcaptcha/i.test(url)) return true
  const title = await page.title().catch(() => '')
  if (/captcha|robot|human verification|attention required|security verification|just a moment/i.test(title)) return true
  const count = await page.locator(
    'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], ' +
    'iframe[src*="challenges.cloudflare.com"], ' +
    '.cf-challenge, #cf-challenge-running, .cf-turnstile, [class*="captcha"]'
  ).count()
  return count > 0
}

export async function dismissCookieBanner(page: Page): Promise<void> {
  const candidates = [
    // Quantcast GDPR consent overlay (fc-consent-root) — used by Radaris and others
    '.fc-cta-consent',
    'button.fc-cta-consent',
    '.fc-consent-root button:has-text("Consent")',
    '.fc-consent-root button:has-text("OK")',
    '.fc-consent-root button:has-text("Accept")',
    // Standard cookie banners
    'button:has-text("Accept All")',
    'button:has-text("Accept all cookies")',
    'button:has-text("Accept")',
    'button:has-text("I Agree")',
    'button:has-text("OK")',
    'button:has-text("Got it")',
    '[id*="cookie-accept"]',
    '[class*="cookie-accept"]',
  ]
  for (const sel of candidates) {
    try {
      const btn = page.locator(sel).first()
      if (await btn.isVisible({ timeout: 800 })) {
        await btn.click()
        await sleep(400)
        return
      }
    } catch { /* try next */ }
  }
}

/**
 * Try each selector in order; return the first one whose count > 0, or null.
 */
export async function findFirst(page: Page, selectors: string[], timeout = 10000): Promise<string | null> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      try {
        if (await page.locator(sel).count() > 0) return sel
      } catch { /* continue */ }
    }
    await sleep(250)
  }
  return null
}

export async function fillVisible(page: Page, selectors: string[], value: string): Promise<boolean> {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first()
      if (await el.isVisible({ timeout: 2000 })) {
        await el.fill(value)
        return true
      }
    } catch { /* try next */ }
  }
  return false
}

export async function clickFirst(page: Page, selectors: string[]): Promise<boolean> {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first()
      if (await el.isVisible({ timeout: 2000 })) {
        await el.click()
        return true
      }
    } catch { /* try next */ }
  }
  return false
}

export function stateAbbr(state: string): string {
  const map: Record<string, string> = {
    Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
    Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
    Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
    Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
    Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
    Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH',
    'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC',
    'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA',
    'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN',
    Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA',
    'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
  }
  if (state.length === 2) return state.toUpperCase()
  return map[state] ?? state
}

export function parseDob(dob: string): { year: string; month: string; day: string; monthPad: string } {
  const [year, monthPad, day] = dob.split('-')
  return { year, month: String(parseInt(monthPad, 10)), day, monthPad }
}

/** Calculate age in years from a YYYY-MM-DD date of birth string */
export function calculateAge(dob: string): number {
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

/**
 * Try to fill an age field on the current page.
 * Handles both text inputs (fills the number) and select dropdowns (selects the closest option).
 */
export async function fillAge(page: Page, dob: string): Promise<void> {
  const age = calculateAge(dob)
  const ageStr = String(age)

  // Text input
  const ageInput = page.locator(
    'input[name*="age" i], input[placeholder*="age" i], input[id*="age" i]'
  ).first()
  if (await ageInput.isVisible({ timeout: 1000 }).catch(() => false)) {
    await ageInput.fill(ageStr)
    return
  }

  // Select dropdown — pick the option whose value or text is closest to the age
  const ageSel = page.locator('select[name*="age" i], select[id*="age" i]').first()
  if (await ageSel.isVisible({ timeout: 1000 }).catch(() => false)) {
    // Try exact match first, then label-based match
    await ageSel.selectOption({ value: ageStr }).catch(async () => {
      const options = await ageSel.locator('option').all()
      // Find the option whose text is closest to the age
      for (const opt of options) {
        const text = (await opt.textContent() ?? '').trim()
        if (text.includes(ageStr) || text.startsWith(ageStr)) {
          await ageSel.selectOption({ label: text }).catch(() => {})
          return
        }
      }
    })
  }
}

/** Check whether the current page looks like a success/confirmation page */
export async function isConfirmationPage(page: Page): Promise<boolean> {
  const text = (await page.textContent('body').catch(() => '') ?? '').toLowerCase()
  return /your (request|opt.?out|removal) (has been|was) (received|submitted|confirmed|processed)/i.test(text)
    || /successfully (removed|opted out|submitted)/i.test(text)
    || /you.?ve been (removed|opted out)/i.test(text)
    || /check your email/i.test(text)
}

/**
 * Inspect the page after submitting an opt-out form and return an honest status
 * instead of blindly assuming success. Detects explicit site errors, "check your
 * email" confirmations, and generic success messages.
 */
export async function classifySubmitResult(page: Page, emailPattern: string): Promise<OptOutResult> {
  const body = ((await page.textContent('body').catch(() => '')) ?? '').toLowerCase()

  // Behavioral bot walls (e.g. InfoPay "BotShield" slide-to-verify) appear AFTER
  // submit and silently block the opt-out — Playwright can't pass them.
  const botChallengePatterns = [
    /are you human/i, /slide to verify/i, /press & hold/i, /security check/i,
    /bot.?shield/i, /verify you.?re (a )?human/i, /complete the (security )?check/i,
  ]
  if (botChallengePatterns.some(re => re.test(body))) {
    return { status: 'manual', reason: 'soumission bloquée par une vérification anti-bot (slide-to-verify) — opt-out à finaliser manuellement' }
  }

  const errorPatterns = [
    /something went wrong/i, /please try again/i, /an error (has )?occurred/i,
    /unable to process/i, /request failed/i, /too many requests/i, /rate limit/i,
    /temporarily unavailable/i, /access denied/i, /forbidden/i,
  ]
  for (const re of errorPatterns) {
    const m = body.match(re)
    if (m) return { status: 'failed', reason: `site error after submit: "${m[0]}"` }
  }

  const emailPatterns = [
    /check your email/i, /we.?ve sent/i, /email.*(sent|on its way)/i,
    /verification.*(link|email)/i, /confirm.*email/i, /please verify/i, /look for.*email/i,
  ]
  if (emailPatterns.some(re => re.test(body)) || await isConfirmationPage(page)) {
    return { status: 'awaiting_email', confirmationPattern: emailPattern }
  }

  const submittedPatterns = [
    /your (request|opt.?out|removal) (has been|was) (received|submitted)/i,
    /has been submitted/i, /successfully (removed|opted out|submitted)/i, /thank you/i,
  ]
  if (submittedPatterns.some(re => re.test(body))) return { status: 'submitted' }

  return { status: 'failed', reason: 'ambiguous result after submit — no confirmation detected on page' }
}
