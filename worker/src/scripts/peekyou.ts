import type { BrokerScriptFn } from './_types.js'

// All known PeekYou opt-out URLs (/about/contact/opt_out/, /about/contact/optout,
// /optout, /privacy) redirect to the homepage. No automated removal is possible.
// Users must email privacy@peekyou.com with their name and profile URL.
export const run: BrokerScriptFn = async () => {
  return { status: 'manual' }
}
