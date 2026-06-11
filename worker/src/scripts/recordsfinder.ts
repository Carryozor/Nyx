import type { BrokerScriptFn } from './_types.js'
import { setup, humanDelay, screenshot, hasCaptcha, sleep, stateAbbr, fillAge, classifySubmitResult } from './_helpers.js'

// RecordsFinder uses InfoPay backend: field names like InfoPay_...[fname]
export const run: BrokerScriptFn = async ({ page, pii, screenshotDir }) => {
  await setup(page)
  await page.goto('https://www.recordsfinder.com/optout/', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  })
  await humanDelay()
  if (await hasCaptcha(page)) return { status: 'failed', reason: 'captcha on landing page' }

  await page.locator('button:has-text("Accept"), button:has-text("OK")').first().click().catch(() => {})
  await sleep(400)

  // InfoPay model field names contain "fname", "lname", "city", "state"
  const fnInput = page.locator('input[name*="fname"], input[name*="first" i]').first()
  if (!(await fnInput.isVisible({ timeout: 10000 }).catch(() => false))) {
    await screenshot(page, screenshotDir, 'no-form')
    return { status: 'manual', reason: 'Form not found — visit recordsfinder.com/optout/ manually' }
  }

  await fnInput.fill(pii.firstName).catch(() => {})
  await humanDelay(300, 500)
  await page.locator('input[name*="lname"], input[name*="last" i]').first().fill(pii.lastName).catch(() => {})
  await humanDelay(300, 500)
  await page.locator('input[name*="city"]').first().fill(pii.currentAddress.city).catch(() => {})
  await humanDelay(200, 400)

  if (pii.currentAddress.state) {
    const abbr = stateAbbr(pii.currentAddress.state)
    const stSel = page.locator('select[name*="state"]').first()
    if (await stSel.count() > 0) {
      await stSel.selectOption({ value: abbr }).catch(() =>
        stSel.selectOption({ label: pii.currentAddress.state! }).catch(() => {})
      )
    } else {
      await page.locator('input[name*="state"]').first().fill(abbr).catch(() => {})
    }
    await humanDelay(200, 400)
  }

  await fillAge(page, pii.dob).catch(() => {})
  await humanDelay(200, 400)
  await screenshot(page, screenshotDir, 'form-filled')

  if (await hasCaptcha(page)) return { status: 'failed', reason: 'captcha before submit' }

  await page.locator('button[type="submit"], input[type="submit"], button:has-text("Remove"), button:has-text("Opt Out"), button:has-text("Search")').first().click().catch(() => {})
  await sleep(2000)
  await screenshot(page, screenshotDir, 'done')
  return classifySubmitResult(page, 'recordsfinder')
}
