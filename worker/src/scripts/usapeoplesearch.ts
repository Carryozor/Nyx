import type { BrokerScriptFn } from './_types.js'
// IP blocked by Cloudflare on this server — manual opt-out required.
export const run: BrokerScriptFn = async () => ({ status: 'manual', reason: 'IP du serveur bannie — opt-out manuel requis (voir guide)' })
