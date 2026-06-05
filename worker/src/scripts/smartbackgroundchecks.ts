import type { BrokerScriptFn } from './_types.js'
import { setup, humanDelay, screenshot, requireEmail, hasCaptcha, sleep, stateAbbr, fillAge } from './_helpers.js'

export const run: BrokerScriptFn = async ({ page, pii, screenshotDir }) => {
  const emailOrErr = requireEmail(pii)
  if (typeof emailOrErr !== 'string') return emailOrErr
  await setup(page)
  await page.goto('https://www.smartbackgroundchecks.com/optout', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await humanDelay()
  if (await hasCaptcha(page)) return { status: 'failed', reason: 'captcha on landing page' }
  await page.locator('button:has-text("Accept"), button:has-text("OK")').first().click().catch(() => {})
  await sleep(400)
  const firstInput = page.locator('input[name*="first" i], input[placeholder*="First" i]').first()
  if (!(await firstInput.isVisible({ timeout: 10000 }).catch(() => false))) {
    await screenshot(page, screenshotDir, 'no-form')
    return { status: 'manual', reason: 'Form not found — visit smartbackgroundchecks.com/optout manually' }
  }
  await firstInput.fill(pii.firstName).catch(() => {})
  await humanDelay(300, 500)
  await page.locator('input[name*="last" i], input[placeholder*="Last" i]').first().fill(pii.lastName).catch(() => {})
  await humanDelay(300, 500)
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(emailOrErr).catch(() => {})
  await humanDelay(300, 500)
  if (pii.currentAddress.state) {
    const abbr = stateAbbr(pii.currentAddress.state)
    await page.locator('select[name*="state" i]').first().selectOption({ value: abbr }).catch(() =>
      page.locator('input[name*="state" i]').first().fill(abbr).catch(() => {})
    )
    await humanDelay(200, 400)
  }
  await fillAge(page, pii.dob).catch(() => {})
  await humanDelay(200, 400)

  await screenshot(page, screenshotDir, 'form-filled')
  if (await hasCaptcha(page)) return { status: 'failed', reason: 'captcha before submit' }
  await page.locator('button[type="submit"], input[type="submit"], button:has-text("Remove"), button:has-text("Submit"), button:has-text("Opt Out")').first().click().catch(() => {})
  await sleep(2000)
  await screenshot(page, screenshotDir, 'done')
  return { status: 'awaiting_email', confirmationPattern: 'smartbackgroundchecks' }
}
