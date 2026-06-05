import type { BrokerScriptFn } from './_types.js'

// FastBackgroundCheck blocks this server's IP via Cloudflare (403 on all requests).
export const run: BrokerScriptFn = async () => ({
  status: 'manual',
  reason: 'IP du serveur bannie par Cloudflare — visitez fastbackgroundcheck.com/removal depuis votre navigateur, ou envoyez un email à privacy@fastbackgroundcheck.com',
})
