import type { BrokerScriptFn } from './_types.js'
import { setup, requireEmail } from './_helpers.js'
import { peopleConnectOptOut } from './_peopleconnect.js'

// Intelius is part of PeopleConnect and uses the same opt-out portal structure
export const run: BrokerScriptFn = async ({ page, pii, screenshotDir, profileId, db }) => {
  const emailOrErr = requireEmail(pii)
  if (typeof emailOrErr !== 'string') return emailOrErr

  await setup(page)
  return peopleConnectOptOut(page, pii, emailOrErr, {
    searchUrl: 'https://www.intelius.com/opt-out/',
    emailPattern: 'intelius',
    screenshotDir,
  }, profileId, db)
}
