import type { BrokerScriptFn } from './_types.js'
import path from 'node:path'

export const run: BrokerScriptFn = async ({ page, pii, screenshotDir, brokerId }) => {
  try {
    await page.goto('https://www.intelius.com/opt-out', { waitUntil: 'domcontentloaded', timeout: 30000 })

    await page.fill('input[placeholder*="First"], input[name*="first"]', pii.firstName)
    await page.fill('input[placeholder*="Last"], input[name*="last"]', pii.lastName)
    if (pii.currentAddress.state) {
      const sel = page.locator('select[name*="state"]').first()
      if ((await sel.count()) > 0) await sel.selectOption({ value: pii.currentAddress.state })
    }

    await page.click('button[type="submit"]')
    await page.waitForLoadState('networkidle', { timeout: 20000 })
    await page.screenshot({ path: path.join(screenshotDir, 'search.png') })

    const optOut = page.locator('a:has-text("Remove"), button:has-text("Remove")').first()
    if ((await optOut.count()) === 0) return { status: 'already_removed' }

    await optOut.click()
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const emailInput = page.locator('input[type="email"]').first()
    if ((await emailInput.count()) > 0) {
      await emailInput.fill('nyx-optout@example.com')
      await page.click('button[type="submit"]')
      await page.waitForLoadState('networkidle', { timeout: 10000 })
    }

    await page.screenshot({ path: path.join(screenshotDir, 'done.png') })
    return { status: 'awaiting_email', confirmationPattern: 'intelius.*opt.?out|removal.*confirm' }
  } catch (err) {
    return { status: 'failed', reason: String(err) }
  }
}
