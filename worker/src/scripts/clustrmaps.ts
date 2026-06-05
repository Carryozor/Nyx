import type { BrokerScriptFn } from './_types.js'

// ClustRMaps opt-out is based on submitting the URL of the page that lists the person,
// not a standard name/email form. Automation is not reliable without knowing that URL upfront.
export const run: BrokerScriptFn = async () => ({
  status: 'manual',
  reason:
    'ClustRMaps opt-out requires the URL of the specific page listing your data. ' +
    'Go to https://clustrmaps.com/bl/opt-out, enter the URL of the page that shows your information, ' +
    'then submit the removal request.',
})
