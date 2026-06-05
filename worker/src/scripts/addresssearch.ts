import type { BrokerScriptFn } from './_types.js'

// addresssearch.com/removerecord.php returns "File not found" — site is unavailable.
export const run: BrokerScriptFn = async () => {
  return { status: 'failed', reason: 'addresssearch.com opt-out page is unavailable (404) — site may be defunct' }
}
