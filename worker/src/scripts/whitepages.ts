import type { BrokerScriptFn } from './_types.js'
import path from 'node:path'

export const run: BrokerScriptFn = async ({ page, pii, screenshotDir, brokerId }) => {
  try {
    await page.goto('https://www.whitepages.com/suppression_requests/new', { waitUntil: 'domcontentloaded', timeout: 30000 })

    await page.fill('input[id*="firstName"], input[name*="first"]', pii.firstName)
    await page.fill('input[id*="lastName"], input[name*="last"]', pii.lastName)
    await page.fill('input[id*="city"], input[name*="city"]', pii.currentAddress.city)
    if (pii.currentAddress.state) {
      const stateInput = page.locator('input[id*="state"]').first()
      if ((await stateInput.count()) > 0) await stateInput.fill(pii.currentAddress.state)
    }

    await page.click('button[type="submit"]')
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    await page.screenshot({ path: path.join(screenshotDir, 'search.png') })

    const removeLink = page.locator('a:has-text("Remove my listing"), a[href*="suppression"]').first()
    if ((await removeLink.count()) === 0) return { status: 'already_removed' }

    await removeLink.click()
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const emailInput = page.locator('input[type="email"]').first()
    if ((await emailInput.count()) > 0) {
      await emailInput.fill('nyx-optout@example.com')
      await page.click('button[type="submit"]')
      await page.waitForLoadState('networkidle', { timeout: 10000 })
    }

    await page.screenshot({ path: path.join(screenshotDir, 'done.png') })
    return { status: 'awaiting_email', confirmationPattern: 'whitepages.*confirm|opt.?out.*whitepages' }
  } catch (err) {
    return { status: 'failed', reason: String(err) }
  }
}
