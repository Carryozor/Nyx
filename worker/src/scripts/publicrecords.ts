import type { BrokerScriptFn } from './_types.js'

// publicrecordsnow.com opt-out URL (/include/optout.php) returns 404 — site is unavailable.
export const run: BrokerScriptFn = async () => {
  return { status: 'failed', reason: 'publicrecordsnow.com opt-out page is unavailable (404) — site may be defunct' }
}
