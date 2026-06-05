import type { BrokerScriptFn } from './_types.js'
import { setup, humanDelay, screenshot, hasCaptcha, sleep } from './_helpers.js'

// SpyDialer opt-out is phone-number based — requires pii.phone to be set.
export const run: BrokerScriptFn = async ({ page, pii, screenshotDir }) => {
  if (!pii.phone) {
    return {
      status: 'manual',
      reason: 'SpyDialer opt-out requires a phone number. Add your phone number to your profile, then re-run.',
    }
  }

  await setup(page)
  await page.goto('https://www.spydialer.com/optout.aspx', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  })
  await humanDelay()
  if (await hasCaptcha(page)) return { status: 'failed', reason: 'captcha on landing page' }

  await page.locator('button:has-text("Accept"), button:has-text("OK")').first().click().catch(() => {})
  await sleep(600)

  await screenshot(page, screenshotDir, 'page')

  // Phone input — SpyDialer indexes by phone number
  const phoneInput = page.locator('input[type="tel"], input[name*="phone" i], input[placeholder*="phone" i], input[id*="phone" i]').first()
  if (!(await phoneInput.isVisible({ timeout: 10000 }).catch(() => false))) {
    await screenshot(page, screenshotDir, 'no-form')
    return { status: 'manual', reason: 'Form not found — visit spydialer.com/optout.aspx manually' }
  }

  // Normalize phone: remove non-digits, format as US number
  const phone = pii.phone.replace(/\D/g, '').replace(/^0+/, '')
  await phoneInput.fill(phone).catch(() => {})
  await humanDelay(400, 700)

  await screenshot(page, screenshotDir, 'form-filled')
  if (await hasCaptcha(page)) return { status: 'failed', reason: 'captcha before submit' }

  await page.locator('button[type="submit"], input[type="submit"], button:has-text("Opt Out"), button:has-text("Remove"), button:has-text("Submit")').first().click().catch(() => {})
  await sleep(2000)
  await screenshot(page, screenshotDir, 'done')
  return { status: 'submitted' }
}
