import type { BrokerScriptFn } from './_types.js'
import { setup, humanDelay, screenshot, hasCaptcha, sleep, requireEmail } from './_helpers.js'

// Pages Blanches (France) — opt-out via pagesjaunes.fr suppression form.
// The suppression mechanism requires finding the profile and requesting removal.
export const run: BrokerScriptFn = async ({ page, pii, screenshotDir }) => {
  const emailOrErr = requireEmail(pii)
  if (typeof emailOrErr !== 'string') return emailOrErr

  await setup(page)

  // Search for the person on Pages Blanches
  const firstName = encodeURIComponent(pii.firstName)
  const lastName  = encodeURIComponent(pii.lastName)
  const city      = encodeURIComponent(pii.currentAddress.city)

  await page.goto(
    `https://www.pagesjaunes.fr/pagesblanches/recherche?quoiqui=${firstName}+${lastName}&ou=${city}`,
    { waitUntil: 'domcontentloaded', timeout: 30000 }
  )
  await humanDelay()

  if (await hasCaptcha(page)) {
    return { status: 'manual', reason: 'CAPTCHA sur Pages Blanches — visitez pagesjaunes.fr/pagesblanches manuellement' }
  }

  await page.locator('button:has-text("Accepter"), button:has-text("Accept"), button:has-text("OK")')
    .first().click().catch(() => {})
  await sleep(400)

  await screenshot(page, screenshotDir, 'search-results')

  // Look for "Supprimer ma fiche" or "Signaler" link on results
  const suppressLink = page.locator('a:has-text("Supprimer"), a:has-text("Signaler"), button:has-text("Supprimer")').first()
  if (await suppressLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await suppressLink.click()
    await sleep(2000)
    await screenshot(page, screenshotDir, 'suppression-form')

    // Fill email if form appears
    const emailInput = page.locator('input[type="email"]').first()
    if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await emailInput.fill(emailOrErr)
      await humanDelay()
      const submitBtn = page.locator('button[type="submit"]').first()
      if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitBtn.click()
        await sleep(2000)
        await screenshot(page, screenshotDir, 'submitted')
        return { status: 'submitted' }
      }
    }
  }

  // No profile found or no suppress button — guide to email
  return {
    status: 'manual',
    reason:
      'Pages Blanches : aucune fiche trouvée ou formulaire indisponible. ' +
      'Envoyez un email à donnees-personnelles@solocal.com avec objet "Suppression RGPD" ' +
      'et une copie de pièce d\'identité.',
  }
}
