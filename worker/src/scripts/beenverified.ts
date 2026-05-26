import type { BrokerScriptFn } from './_types.js'
import path from 'node:path'

export const run: BrokerScriptFn = async ({ page, pii, screenshotDir, brokerId }) => {
  try {
    await page.goto('https://www.beenverified.com/app/optout/search', { waitUntil: 'domcontentloaded', timeout: 30000 })

    await page.fill('input[name="firstName"]', pii.firstName)
    await page.fill('input[name="lastName"]', pii.lastName)
    if (pii.currentAddress.state) {
      const sel = page.locator('select[name="state"]').first()
      if ((await sel.count()) > 0) await sel.selectOption({ label: pii.currentAddress.state })
    }

    await page.click('button[type="submit"]')
    await page.waitForSelector('[class*="result"], [class*="profile-card"]', { timeout: 20000 }).catch(() => null)
    await page.screenshot({ path: path.join(screenshotDir, 'search.png') })

    const optOut = page.locator('a:has-text("OPT OUT"), button:has-text("OPT OUT"), a:has-text("Opt Out")').first()
    if ((await optOut.count()) === 0) return { status: 'already_removed' }

    await optOut.click()
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const emailInput = page.locator('input[type="email"]').first()
    if ((await emailInput.count()) > 0) {
      await emailInput.fill('nyx-optout@example.com')
      await page.click('button[type="submit"]')
      await page.waitForLoadState('networkidle', { timeout: 10000 })
    }

    await page.screenshot({ path: path.join(screenshotDir, 'submitted.png') })
    return { status: 'awaiting_email', confirmationPattern: 'beenverified.*confirm|opt.?out.*confirm' }
  } catch (err) {
    return { status: 'failed', reason: String(err) }
  }
}
