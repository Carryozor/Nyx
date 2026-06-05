import type { BrokerScriptFn } from './_types.js'
import { setup, requireEmail } from './_helpers.js'
import { peopleConnectOptOut } from './_peopleconnect.js'

// ZabaSearch is owned by PeopleConnect (Intelius parent).
// Their opt-out is processed through the Intelius portal.
export const run: BrokerScriptFn = async ({ page, pii, screenshotDir, profileId, db }) => {
  const emailOrErr = requireEmail(pii)
  if (typeof emailOrErr !== 'string') return emailOrErr

  await setup(page)
  return peopleConnectOptOut(page, pii, emailOrErr, {
    searchUrl: 'https://www.intelius.com/opt-out/',
    emailPattern: 'intelius|zabasearch',
    screenshotDir,
  }, profileId, db)
}
