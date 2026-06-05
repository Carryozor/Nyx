import type { BrokerScriptFn } from './_types.js'
import { setup, requireEmail } from './_helpers.js'
import { peopleConnectOptOut } from './_peopleconnect.js'

// USSearch is owned by PeopleConnect and redirects to suppression.peopleconnect.us
export const run: BrokerScriptFn = async ({ page, pii, screenshotDir, profileId, db }) => {
  const emailOrErr = requireEmail(pii)
  if (typeof emailOrErr !== 'string') return emailOrErr

  await setup(page)
  return peopleConnectOptOut(page, pii, emailOrErr, {
    emailPattern: 'ussearch|peopleconnect',
    screenshotDir,
  }, profileId, db)
}
