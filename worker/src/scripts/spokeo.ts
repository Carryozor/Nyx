import type { BrokerScriptFn } from './_types.js'
import path from 'node:path'

export const run: BrokerScriptFn = async ({ page, pii, screenshotDir, brokerId }) => {
  try {
    await page.goto('https://www.spokeo.com/optout', { waitUntil: 'domcontentloaded', timeout: 30000 })

    await page.fill('input[name="firstName"], input[placeholder*="First"]', pii.firstName)
    await page.fill('input[name="lastName"], input[placeholder*="Last"]', pii.lastName)
    if (pii.currentAddress.state) {
      const stateInput = page.locator('input[name="state"], input[placeholder*="State"]').first()
      if (await stateInput.count() > 0) await stateInput.fill(pii.currentAddress.state)
    }
    await page.fill('input[name="city"], input[placeholder*="City"]', pii.currentAddress.city)

    await page.click('button[type="submit"], input[type="submit"]')
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    await page.screenshot({ path: path.join(screenshotDir, 'search.png') })

    const optOutBtn = page.locator('a[href*="optout"], button:has-text("Remove"), a:has-text("Remove")').first()
    if ((await optOutBtn.count()) === 0) return { status: 'already_removed' }

    await optOutBtn.click()
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const emailInput = page.locator('input[type="email"]').first()
    if ((await emailInput.count()) > 0) {
      await emailInput.fill('nyx-optout@example.com')
      await page.click('button[type="submit"]')
      await page.waitForLoadState('networkidle', { timeout: 10000 })
    }

    await page.screenshot({ path: path.join(screenshotDir, 'submitted.png') })
    return { status: 'awaiting_email', confirmationPattern: 'spokeo.*optout|opt.?out.*spokeo|removal.*confirm' }
  } catch (err) {
    return { status: 'failed', reason: String(err) }
  }
}
