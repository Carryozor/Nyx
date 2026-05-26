import type { BrokerScriptFn } from './_types.js'
import path from 'node:path'

export const run: BrokerScriptFn = async ({ page, pii, screenshotDir, brokerId }) => {
  try {
    await page.goto('https://www.truthfinder.com/opt-out', { waitUntil: 'domcontentloaded', timeout: 30000 })

    await page.fill('input[name="firstName"]', pii.firstName)
    await page.fill('input[name="lastName"]', pii.lastName)
    if (pii.currentAddress.state) {
      const sel = page.locator('select[name="state"]').first()
      if ((await sel.count()) > 0) await sel.selectOption({ value: pii.currentAddress.state })
    }

    await page.click('button[type="submit"]')
    await page.waitForSelector('[class*="search-result"], [class*="person-card"]', { timeout: 20000 }).catch(() => null)
    await page.screenshot({ path: path.join(screenshotDir, 'search.png') })

    const removeBtn = page.locator('button:has-text("Remove"), a:has-text("Remove my info")').first()
    if ((await removeBtn.count()) === 0) return { status: 'already_removed' }

    await removeBtn.click()
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    const emailInput = page.locator('input[type="email"]').first()
    if ((await emailInput.count()) > 0) {
      await emailInput.fill('nyx-optout@example.com')
      await page.click('button[type="submit"]')
      await page.waitForLoadState('networkidle', { timeout: 10000 })
    }

    await page.screenshot({ path: path.join(screenshotDir, 'done.png') })
    return { status: 'awaiting_email', confirmationPattern: 'truthfinder.*opt.?out' }
  } catch (err) {
    return { status: 'failed', reason: String(err) }
  }
}
