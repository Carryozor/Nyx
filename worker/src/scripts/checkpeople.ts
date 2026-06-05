import type { BrokerScriptFn } from './_types.js'
import { setup, requireEmail } from './_helpers.js'
import { peopleConnectOptOut } from './_peopleconnect.js'

export const run: BrokerScriptFn = async ({ page, pii, screenshotDir, profileId, db }) => {
  const emailOrErr = requireEmail(pii)
  if (typeof emailOrErr !== 'string') return emailOrErr

  await setup(page)
  return peopleConnectOptOut(page, pii, emailOrErr, {
    searchUrl: 'https://www.checkpeople.com/do-not-sell-info',
    emailPattern: 'checkpeople|peopleconnect',
    screenshotDir,
  }, profileId, db)
}
