import type { BrokerScriptFn } from './_types.js'
import { setup, humanDelay, screenshot, hasCaptcha, requireEmail } from './_helpers.js'

// Infobel — EU/international directory with GDPR removal form.
export const run: BrokerScriptFn = async ({ page, pii, screenshotDir }) => {
  const emailOrErr = requireEmail(pii)
  if (typeof emailOrErr !== 'string') return emailOrErr

  await setup(page)

  await page.goto('https://www.infobel.com/fr/world/data_removal', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await humanDelay()

  if (await hasCaptcha(page)) {
    return { status: 'manual', reason: 'CAPTCHA sur Infobel — visitez infobel.com/fr/world/data_removal manuellement' }
  }

  await screenshot(page, screenshotDir, 'page')

  const nameInput = page.locator('input[name*="name" i], input[placeholder*="name" i], input[placeholder*="nom" i]').first()
  if (!(await nameInput.isVisible({ timeout: 10000 }).catch(() => false))) {
    return {
      status: 'manual',
      reason: 'Formulaire Infobel non trouvé — visitez infobel.com/fr/world/data_removal manuellement',
    }
  }

  await nameInput.fill(`${pii.firstName} ${pii.lastName}`)
  await humanDelay()

  const emailInput = page.locator('input[type="email"], input[name*="email" i]').first()
  if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await emailInput.fill(emailOrErr)
    await humanDelay()
  }

  await screenshot(page, screenshotDir, 'form-filled')

  if (await hasCaptcha(page)) {
    return { status: 'manual', reason: 'CAPTCHA avant soumission Infobel — complétez manuellement' }
  }

  const submitBtn = page.locator('button[type="submit"], input[type="submit"]').first()
  if (!(await submitBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
    return { status: 'manual', reason: 'Bouton de soumission Infobel non trouvé' }
  }

  await submitBtn.click()
  await humanDelay(2000, 3000)

  await screenshot(page, screenshotDir, 'done')
  return { status: 'submitted' }
}
