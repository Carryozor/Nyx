import type { BrokerScriptFn } from './_types.js'
import { setup, humanDelay, screenshot, hasCaptcha, sleep } from './_helpers.js'

// 118712 (SFR annuaire) — suppression de fiche via formulaire web
export const run: BrokerScriptFn = async ({ page, pii, screenshotDir }) => {
  await setup(page)

  await page.goto('https://www.118712.fr/suppression-fiche', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  }).catch(() => null)
  await humanDelay()

  if (await hasCaptcha(page)) {
    return { status: 'manual', reason: 'CAPTCHA sur 118712 — visitez 118712.fr/suppression-fiche manuellement' }
  }

  await page.locator('button:has-text("Accepter"), button:has-text("OK"), [id*="accept"]')
    .first().click().catch(() => {})
  await sleep(400)

  await screenshot(page, screenshotDir, 'page')

  const nameInput = page.locator('input[name*="nom" i], input[placeholder*="nom" i], input[name*="name" i]').first()
  if (!(await nameInput.isVisible({ timeout: 10000 }).catch(() => false))) {
    return { status: 'manual', reason: 'Formulaire 118712 non trouvé — visitez 118712.fr manuellement' }
  }

  await nameInput.fill(`${pii.firstName} ${pii.lastName}`).catch(() => {})
  await humanDelay(300, 600)

  const phoneInput = page.locator('input[type="tel"], input[name*="phone" i], input[name*="tel" i]').first()
  if (await phoneInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    if (pii.phone) await phoneInput.fill(pii.phone).catch(() => {})
  }

  await screenshot(page, screenshotDir, 'form-filled')

  const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Supprimer"), button:has-text("Valider")').first()
  if (!(await submitBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
    return { status: 'manual', reason: 'Bouton de suppression 118712 non trouvé' }
  }

  await submitBtn.click()
  await sleep(2000)
  await screenshot(page, screenshotDir, 'done')
  return { status: 'submitted' }
}
