import type { BrokerScriptFn } from './_types.js'
import { setup, humanDelay, screenshot, requireEmail, hasCaptcha, sleep, fillAge } from './_helpers.js'

export const run: BrokerScriptFn = async ({ page, pii, screenshotDir }) => {
  const emailOrErr = requireEmail(pii)
  if (typeof emailOrErr !== 'string') return emailOrErr

  await setup(page)

  await page.goto('https://nuwber.com/removal/link', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await humanDelay()

  if (await hasCaptcha(page)) return { status: 'failed', reason: 'captcha on landing page' }

  const url = page.url()
  if (!url.includes('nuwber.com')) {
    return { status: 'failed', reason: 'redirected away from nuwber.com — site structure may have changed' }
  }

  await page.locator('button:has-text("Accept"), button:has-text("OK"), [id*="accept"]')
    .first().click().catch(() => {})
  await sleep(400)
  await screenshot(page, screenshotDir, 'page')

  const firstInput = page.locator('input[name*="first" i], input[id*="first" i], input[placeholder*="First" i]').first()
  if (!(await firstInput.isVisible({ timeout: 10000 }).catch(() => false))) {
    await screenshot(page, screenshotDir, 'no-form')
    return { status: 'manual', reason: 'Nuwber removal form not found — visit nuwber.com/removal/link manually' }
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
    } else {
      await page.locator('input[name*="state" i]').first().fill(abbr).catch(() => {})
    }
    await humanDelay(200, 400)
  }

  await page.locator('input[type="email"], input[name*="email" i]')
    .first().fill(emailOrErr).catch(() => {})
  await humanDelay(300, 500)

  await fillAge(page, pii.dob).catch(() => {})
  await humanDelay(200, 400)

  await screenshot(page, screenshotDir, 'form-filled')

  if (await hasCaptcha(page)) return { status: 'failed', reason: 'captcha before submit' }

  const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Send"), button:has-text("Submit"), button:has-text("Remove")').first()
  if (!(await submitBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
    return { status: 'failed', reason: 'submit button not found' }
  }
  await submitBtn.click()
  await sleep(3000)

  if (await hasCaptcha(page)) return { status: 'failed', reason: 'captcha on submit' }

  await screenshot(page, screenshotDir, 'done')
  return { status: 'awaiting_email', confirmationPattern: 'nuwber' }
}
