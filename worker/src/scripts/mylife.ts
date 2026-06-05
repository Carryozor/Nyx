import type { BrokerScriptFn } from './_types.js'
import { setup, humanDelay, screenshot, requireEmail, hasCaptcha, parseDob, sleep } from './_helpers.js'

// MyLife opt-out — they move their privacy form frequently.
// Try multiple known URLs before giving up.
export const run: BrokerScriptFn = async ({ page, pii, screenshotDir }) => {
  const emailOrErr = requireEmail(pii)
  if (typeof emailOrErr !== 'string') return emailOrErr

  await setup(page)

  const urls = [
    'https://www.mylife.com/privacy/remove',
    'https://www.mylife.com/consumer-request',
    'https://www.mylife.com/ccpa/index.pubview',
    'https://www.mylife.com/privacy',
  ]

  let landed = false
  for (const url of urls) {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null)
    const status = resp?.status() ?? 0
    if (status !== 404 && status !== 0) { landed = true; break }
  }

  if (!landed) {
    return {
      status: 'manual',
      reason: 'MyLife opt-out page could not be found. Visit mylife.com → Privacy → Remove My Information manually.',
    }
  }

  await humanDelay()

  if (await hasCaptcha(page)) {
    return { status: 'failed', reason: 'Cloudflare/CAPTCHA on MyLife — cannot automate removal' }
  }

  await page.locator('button:has-text("Accept"), button:has-text("OK"), #accept-cookies')
    .first().click().catch(() => {})
  await sleep(500)

  const privacyBtn = page.locator('a:has-text("Opt Out"), a:has-text("Remove"), button:has-text("Opt Out")')
  if (await privacyBtn.count() > 0) {
    await privacyBtn.first().click()
    await humanDelay(1000, 2000)
  }

  await screenshot(page, screenshotDir, 'form')

  const firstInput = page.locator('input[name*="first" i], input[id*="first" i]').first()
  if (!(await firstInput.isVisible({ timeout: 5000 }).catch(() => false))) {
    await screenshot(page, screenshotDir, 'no-form')
    return { status: 'manual', reason: 'MyLife CCPA form not visible — visit mylife.com/privacy manually' }
  }

  const dob = parseDob(pii.dob)

  await firstInput.fill(pii.firstName).catch(() => {})
  await humanDelay(300, 500)
  await page.locator('input[name*="last" i], input[id*="last" i], input[placeholder*="Last" i]')
    .first().fill(pii.lastName).catch(() => {})
  await humanDelay(300, 500)
  await page.locator('input[type="email"], input[name*="email" i]')
    .first().fill(emailOrErr).catch(() => {})
  await humanDelay(300, 500)

  const dobInput = page.locator('input[name*="dob" i], input[id*="dob" i], input[type="date"]').first()
  if (await dobInput.count() > 0) {
    await dobInput.fill(pii.dob).catch(() => {})
  } else {
    await page.locator('select[name*="month" i]').first()
      .selectOption({ value: dob.monthPad }).catch(() => {})
    await page.locator('select[name*="day" i]').first()
      .selectOption({ value: dob.day }).catch(() => {})
    await page.locator('select[name*="year" i]').first()
      .selectOption({ value: dob.year }).catch(() => {})
  }

  const reqType = page.locator('select[name*="request" i], select[name*="type" i]').first()
  if (await reqType.count() > 0) {
    await reqType.selectOption({ label: /delete|remove|opt.?out/i } as unknown as string).catch(() =>
      reqType.selectOption({ index: 1 }).catch(() => {})
    )
  }

  await humanDelay(600, 1200)
  await screenshot(page, screenshotDir, 'form-filled')

  await page.locator('button[type="submit"], input[type="submit"], button:has-text("Submit")')
    .first().click().catch(() => {})
  await sleep(2000)

  if (await hasCaptcha(page)) return { status: 'failed', reason: 'CAPTCHA on submit' }

  await screenshot(page, screenshotDir, 'done')

  const body = await page.textContent('body').catch(() => '')
  if (/confirm|received|check your email|thank you/i.test(body ?? '')) {
    return { status: 'awaiting_email', confirmationPattern: 'mylife' }
  }
  return { status: 'submitted' }
}
