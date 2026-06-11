import type { BrokerScriptFn } from './_types.js'
import { setup, requireEmail } from './_helpers.js'
import { peopleConnectOptOut } from './_peopleconnect.js'

// Addresses.com is an Intelius / PeopleConnect property. Its old /optout.php form
// is gone (404); removal now goes through the shared PeopleConnect suppression centre.
export const run: BrokerScriptFn = async ({ page, pii, screenshotDir, profileId, db }) => {
  const emailOrErr = requireEmail(pii)
  if (typeof emailOrErr !== 'string') return emailOrErr

  await setup(page)
  return peopleConnectOptOut(page, pii, emailOrErr, {
    emailPattern: 'addresses',
    screenshotDir,
  }, profileId, db)
}
