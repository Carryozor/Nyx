import type { BrokerScriptFn } from './_types.js'
import { setup, humanDelay, screenshot, hasCaptcha, sleep, fillAge } from './_helpers.js'

// Truecaller unlisting: submit name + phone number to remove from directory.
// No login required, no email confirmation — just a form submission.
export const run: BrokerScriptFn = async ({ page, pii, screenshotDir }) => {
  await setup(page)

  await page.goto('https://www.truecaller.com/unlisting', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await humanDelay()

  if (await hasCaptcha(page)) {
    return { status: 'manual', reason: 'Truecaller unlisting page has CAPTCHA — visit truecaller.com/unlisting manually' }
  }

  // Accept cookie banner if present
  await page.locator('button:has-text("Accept"), button:has-text("OK"), [id*="accept"]')
    .first().click().catch(() => {})
  await sleep(400)

  await screenshot(page, screenshotDir, 'page')

  // Phone number is required for Truecaller
  if (!pii.phone) {
    return {
      status: 'manual',
      reason: 'Truecaller requires a phone number to unlist — add your phone number to your profile and re-run',
    }
  }

  // Fill phone number (international format)
  const phoneInput = page.locator('input[type="tel"], input[name*="phone" i], input[placeholder*="phone" i]').first()
  if (!(await phoneInput.isVisible({ timeout: 10000 }).catch(() => false))) {
    await screenshot(page, screenshotDir, 'no-form')
    return { status: 'manual', reason: 'Truecaller unlisting form not found — visit truecaller.com/unlisting manually' }
  }

  await phoneInput.fill(pii.phone)
  await humanDelay(400, 700)

  await fillAge(page, pii.dob).catch(() => {})
  await humanDelay(200, 400)

  await screenshot(page, screenshotDir, 'form-filled')

  if (await hasCaptcha(page)) {
    return { status: 'manual', reason: 'CAPTCHA appeared before submit — complete manually at truecaller.com/unlisting' }
  }

  const submitBtn = page.locator('button[type="submit"], button:has-text("Unlist"), button:has-text("Submit"), button:has-text("Remove")').first()
  if (!(await submitBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
    return { status: 'manual', reason: 'Submit button not found — visit truecaller.com/unlisting manually' }
  }

  await submitBtn.click()
  await sleep(3000)

  await screenshot(page, screenshotDir, 'done')

  const body = (await page.textContent('body').catch(() => '') ?? '').toLowerCase()
  if (/success|removed|unlisted|request.*(received|submitted)/i.test(body)) {
    return { status: 'submitted' }
  }

  return { status: 'manual', reason: 'Could not confirm submission — check truecaller.com/unlisting manually' }
}
