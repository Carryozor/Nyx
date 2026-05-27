import type { BrokerScriptFn } from './_types.js'
import { setup, humanDelay, screenshot, requireEmail, hasCaptcha, sleep } from './_helpers.js'

export const run: BrokerScriptFn = async ({ page, pii, screenshotDir }) => {
  const emailOrErr = requireEmail(pii)
  if (typeof emailOrErr !== 'string') return emailOrErr

  await setup(page)

  await page.goto('https://www.familytreenow.com/optout', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await humanDelay()

  if (await hasCaptcha(page)) return { status: 'failed', reason: 'captcha on landing page' }

  const url = page.url()
  if (!url.includes('familytreenow.com')) {
    return { status: 'failed', reason: 'redirected away from familytreenow.com' }
  }

  await page.locator('button:has-text("Accept"), button:has-text("OK"), [id*="accept"]')
    .first().click().catch(() => {})
  await sleep(400)
  await screenshot(page, screenshotDir, 'page')

  // Step 1: Fill the search form to find the person's record
  const firstInput = page.locator('input[name*="first" i], input[id*="first" i], input[placeholder*="First" i]').first()
  if (!(await firstInput.isVisible({ timeout: 10000 }).catch(() => false))) {
    await screenshot(page, screenshotDir, 'no-form')
    return { status: 'manual', reason: 'FamilyTreeNow opt-out search form not found' }
  }

  await firstInput.fill(pii.firstName).catch(() => {})
  await humanDelay(300, 500)

  await page.locator('input[name*="last" i], input[id*="last" i], input[placeholder*="Last" i]')
    .first().fill(pii.lastName).catch(() => {})
  await humanDelay(300, 500)

  if (pii.currentAddress.state) {
    const abbr = pii.currentAddress.state.length === 2
      ? pii.currentAddress.state.toUpperCase()
      : pii.currentAddress.state
    const stSel = page.locator('select[name*="state" i]').first()
    if (await stSel.count() > 0) {
      await stSel.selectOption({ value: abbr }).catch(() =>
        stSel.selectOption({ label: pii.currentAddress.state! }).catch(() => {})
      )
    }
    await humanDelay(200, 400)
  }

  await screenshot(page, screenshotDir, 'search-form-filled')

  const searchBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Search"), button:has-text("Find")').first()
  if (!(await searchBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
    return { status: 'failed', reason: 'search button not found' }
  }
  await searchBtn.click()
  await humanDelay(2000, 3000)

  if (await hasCaptcha(page)) return { status: 'failed', reason: 'captcha after search' }

  await screenshot(page, screenshotDir, 'search-results')

  // Step 2: Find the opt-out button for the first matching record
  const optOutBtn = page.locator('button:has-text("Opt Out"), a:has-text("Opt Out"), input[value*="Opt Out" i]').first()
  if (!(await optOutBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
    // No record found — person may already be removed
    const pageText = (await page.textContent('body').catch(() => '') ?? '').toLowerCase()
    if (/no results|not found|no record/i.test(pageText)) {
      return { status: 'confirmed' }
    }
    await screenshot(page, screenshotDir, 'no-optout-btn')
    return { status: 'manual', reason: 'FamilyTreeNow record not found in search results — opt out manually at familytreenow.com/optout' }
  }
  await optOutBtn.click()
  await humanDelay(1000, 2000)

  await screenshot(page, screenshotDir, 'optout-clicked')

  // Step 3: Enter email on the confirmation form
  const emailInput = page.locator('input[type="email"], input[name*="email" i]').first()
  if (await emailInput.isVisible({ timeout: 8000 }).catch(() => false)) {
    await emailInput.fill(emailOrErr).catch(() => {})
    await humanDelay(300, 500)

    if (await hasCaptcha(page)) return { status: 'failed', reason: 'captcha on email step' }

    const confirmBtn = page.locator('button[type="submit"], button:has-text("Submit"), button:has-text("Opt Out"), button:has-text("Confirm")').first()
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.click()
      await sleep(2000)
    }
  }

  await screenshot(page, screenshotDir, 'done')
  return { status: 'awaiting_email', confirmationPattern: 'familytreenow' }
}
