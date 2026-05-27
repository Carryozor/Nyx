import type { BrokerScriptFn } from './_types.js'
import { setup, humanDelay, screenshot, requireEmail, hasCaptcha, sleep } from './_helpers.js'

export const run: BrokerScriptFn = async ({ page, pii, screenshotDir }) => {
  const emailOrErr = requireEmail(pii)
  if (typeof emailOrErr !== 'string') return emailOrErr

  await setup(page)

  await page.goto('https://www.searchpeoplefree.com/opt-out', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await humanDelay()

  if (await hasCaptcha(page)) return { status: 'failed', reason: 'captcha on landing page' }

  const url = page.url()
  if (!url.includes('searchpeoplefree.com')) {
    return { status: 'failed', reason: 'redirected away from searchpeoplefree.com' }
  }

  await page.locator('button:has-text("Accept"), button:has-text("OK"), [id*="accept"]')
    .first().click().catch(() => {})
  await sleep(400)
  await screenshot(page, screenshotDir, 'page')

  // Search for the record first
  const firstInput = page.locator('input[name*="first" i], input[id*="first" i], input[placeholder*="First" i]').first()
  if (!(await firstInput.isVisible({ timeout: 10000 }).catch(() => false))) {
    await screenshot(page, screenshotDir, 'no-form')
    return { status: 'manual', reason: 'SearchPeopleFREE opt-out form not found — visit searchpeoplefree.com/opt-out manually' }
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
  if (await searchBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await searchBtn.click()
    await humanDelay(2000, 3000)
    if (await hasCaptcha(page)) return { status: 'failed', reason: 'captcha after search' }
    await screenshot(page, screenshotDir, 'search-results')

    const removeBtn = page.locator('button:has-text("Remove"), a:has-text("Remove"), button:has-text("Opt Out"), a:has-text("Opt Out")').first()
    if (await removeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await removeBtn.click()
      await humanDelay(1000, 2000)
    }
  }

  const emailInput = page.locator('input[type="email"], input[name*="email" i]').first()
  if (await emailInput.isVisible({ timeout: 8000 }).catch(() => false)) {
    await emailInput.fill(emailOrErr).catch(() => {})
    await humanDelay(300, 500)

    if (await hasCaptcha(page)) return { status: 'failed', reason: 'captcha on email step' }

    const submitBtn = page.locator('button[type="submit"], button:has-text("Submit"), button:has-text("Remove"), button:has-text("Confirm")').first()
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click()
      await sleep(2000)
    }
  }

  if (await hasCaptcha(page)) return { status: 'failed', reason: 'captcha on submit' }

  await screenshot(page, screenshotDir, 'done')
  return { status: 'awaiting_email', confirmationPattern: 'searchpeoplefree' }
}
