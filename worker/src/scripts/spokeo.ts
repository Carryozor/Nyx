import type { BrokerScriptFn } from './_types.js'
import { setup, humanDelay, screenshot, requireEmail, hasCaptcha, sleep, stateAbbr, calculateAge } from './_helpers.js'

export const run: BrokerScriptFn = async ({ page, pii, screenshotDir }) => {
  const emailOrErr = requireEmail(pii)
  if (typeof emailOrErr !== 'string') return emailOrErr

  await setup(page)

  // ── 1. Search Spokeo to find the person's profile URL ─────────────────────
  // Include location in the query to get to the city-level results page which
  // shows individual profiles with their unique /pNNNN IDs.
  const locationPart = [pii.currentAddress.city, pii.currentAddress.state]
    .filter(Boolean).join(' ')
  const age = calculateAge(pii.dob)
  const q = encodeURIComponent(`${pii.firstName} ${pii.lastName}${locationPart ? ' ' + locationPart : ''}`)
  await page.goto(`https://www.spokeo.com/search?q=${q}&type=people${age ? `&age=${age}` : ''}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await humanDelay(1000, 2000)

  if (await hasCaptcha(page)) return { status: 'failed', reason: 'captcha on Spokeo search' }

  await page.locator('button:has-text("Accept"), button:has-text("OK")')
    .first().click().catch(() => {})
  await sleep(400)

  await screenshot(page, screenshotDir, 'search-results')

  // Individual profile URLs contain a numeric ID prefixed with 'p':
  // e.g. /John-Smith/Illinois/Springfield/p1234567890
  const profileUrl = await page.evaluate(
    ({ first, last }: { first: string; last: string }) => {
      const profilePattern = new RegExp(
        `spokeo\\.com\\/${first}-${last}\\/.*/p\\d+`,
        'i',
      )
      for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
        const { href } = a
        if (profilePattern.test(href)) return href
      }
      return null
    },
    { first: pii.firstName, last: pii.lastName },
  )

  if (!profileUrl) {
    return { status: 'confirmed' }
  }

  // ── 2. Submit opt-out form with the profile URL ───────────────────────────
  await page.goto('https://www.spokeo.com/optout', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await humanDelay()

  if (await hasCaptcha(page)) return { status: 'failed', reason: 'captcha on opt-out page' }

  const urlInput = page.locator('input[name="url"], input[placeholder*="URL" i], input[placeholder*="spokeo.com" i]').first()
  if (!(await urlInput.isVisible({ timeout: 10000 }).catch(() => false))) {
    await screenshot(page, screenshotDir, 'no-form')
    return { status: 'failed', reason: 'opt-out URL input not found — page structure may have changed' }
  }

  // Scroll to the form and fill via keyboard input (React listens to key events)
  await urlInput.scrollIntoViewIfNeeded()
  await urlInput.click()
  await urlInput.selectText().catch(() => page.keyboard.press('Control+a'))
  await page.keyboard.type(profileUrl, { delay: 30 })
  await humanDelay(300, 600)

  const emailInput = page.locator('input[name="email"], input[type="email"]').first()
  if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await emailInput.click()
    await emailInput.selectText().catch(() => page.keyboard.press('Control+a'))
    await page.keyboard.type(emailOrErr, { delay: 30 })
    await humanDelay(300, 600)
  }

  await screenshot(page, screenshotDir, 'form-filled')

  // Use the opt-out form's specific submit button (not the header search button)
  const optOutBtn = page.locator('button:has-text("OPT OUT")').first()
  if (!(await optOutBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
    await screenshot(page, screenshotDir, 'no-submit-btn')
    return { status: 'failed', reason: 'OPT OUT button not found' }
  }
  await optOutBtn.click()
  await sleep(3000)

  if (await hasCaptcha(page)) return { status: 'failed', reason: 'captcha on submission' }

  await screenshot(page, screenshotDir, 'submitted')
  return { status: 'awaiting_email', confirmationPattern: 'spokeo' }
}
