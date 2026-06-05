import type { BrokerScriptFn } from './_types.js'

// FastPeopleSearch blocks this server's IP at the Cloudflare level (IP ban, not just challenge).
// FlareSolverr returns "Probably your IP is banned for this site" — nothing to automate.
export const run: BrokerScriptFn = async () => {
  return {
    status: 'failed',
    reason: 'FastPeopleSearch has IP-banned this server via Cloudflare — manual opt-out required at fastpeoplesearch.com/removal',
  }
}
