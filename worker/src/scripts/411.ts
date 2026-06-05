import type { BrokerScriptFn } from './_types.js'
import { setup, humanDelay, screenshot, requireEmail, hasCaptcha, sleep } from './_helpers.js'

export const run: BrokerScriptFn = async ({ page, pii, screenshotDir }) => {
  const emailOrErr = requireEmail(pii)
  if (typeof emailOrErr !== 'string') return emailOrErr

  await setup(page)

  // 411.com CCPA opt-out: navigate to their do-not-sell page
  await page.goto('https://www.411.com/privacy/do-not-sell', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await humanDelay()

  if (await hasCaptcha(page)) return { status: 'failed', reason: 'captcha on landing page' }

  // If the direct URL 404s or redirects away, try the main privacy page
  const url = page.url()
  if (!url.includes('411.com')) {
    return { status: 'failed', reason: 'redirected away from 411.com — site structure may have changed' }
  }

  await page.locator('button:has-text("Accept"), button:has-text("OK")')
    .first().click().catch(() => {})
  await sleep(400)
  await screenshot(page, screenshotDir, 'page')

  // Look for a form with name/email fields
  const firstInput = page.locator('input[name*="first" i], input[id*="first" i], input[placeholder*="First" i]').first()
  const hasForm = await firstInput.isVisible({ timeout: 8000 }).catch(() => false)

  if (!hasForm) {
    // Try clicking a "Do Not Sell" or "Opt Out" link to navigate to the form
    const optOutLink = page.locator(
      'a:has-text("Do Not Sell"), a:has-text("Opt Out"), a:has-text("opt-out"), a[href*="opt"]'
    ).first()
    if (await optOutLink.count() > 0) {
      await optOutLink.click()
      await humanDelay(1000, 2000)
      await screenshot(page, screenshotDir, 'form-page')
    }
  }

  // Verify form is present before filling
  if (!(await firstInput.isVisible({ timeout: 5000 }).catch(() => false))) {
    await screenshot(page, screenshotDir, 'no-form')
    return { status: 'manual', reason: '411.com opt-out form not found — may require manual submission at 411.com/privacy' }
  }

  await firstInput.fill(pii.firstName).catch(() => {})
  await humanDelay(300, 500)

  await page.locator('input[name*="last" i], input[id*="last" i], input[placeholder*="Last" i]')
    .first().fill(pii.lastName).catch(() => {})
  await humanDelay(300, 500)

  await page.locator('input[type="email"], input[name*="email" i]')
    .first().fill(emailOrErr).catch(() => {})
  await humanDelay(300, 500)

  if (pii.currentAddress.city) {
    await page.locator('input[name*="city" i]').first().fill(pii.currentAddress.city).catch(() => {})
    await humanDelay(200, 400)
  }
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
  }

  await humanDelay(500, 1000)
  await screenshot(page, screenshotDir, 'form-filled')

  const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Submit")').first()
  if (!(await submitBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
    return { status: 'failed', reason: 'submit button not found' }
  }
  await submitBtn.click()
  await sleep(2000)

  if (await hasCaptcha(page)) return { status: 'failed', reason: 'captcha on submit' }
  await screenshot(page, screenshotDir, 'done')
  return { status: 'awaiting_email', confirmationPattern: '411\\.com|411info' }
}
