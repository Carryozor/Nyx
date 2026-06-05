import type { BrokerScriptFn } from './_types.js'

// Whitepages opt-out (suppression-requests and consumer-rights) both require pasting
// the URL of a specific profile page. Getting that URL requires loading the search-results
// page (/name/FirstName-LastName/City-State), which is protected by Cloudflare Managed
// Challenge + DataDome — neither is solvable in headless mode.
// The 5-step suppression flow only accepts individual profile URLs, not search URLs.
export const run: BrokerScriptFn = async () => {
  return {
    status: 'manual',
    reason:
      'Whitepages opt-out requires your specific profile URL. ' +
      'Go to whitepages.com, search for yourself, open your profile page, ' +
      'copy the URL, then paste it at whitepages.com/suppression-requests and complete the 5-step form.',
  }
}
