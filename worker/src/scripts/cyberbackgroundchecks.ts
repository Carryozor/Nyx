import type { BrokerScriptFn } from './_types.js'

// CyberBackgroundChecks blocks this server's IP via Cloudflare (403 on all requests).
// Users must opt-out manually from their browser.
export const run: BrokerScriptFn = async () => ({
  status: 'manual',
  reason: 'IP du serveur bannie par Cloudflare — visitez cyberbackgroundchecks.com/removal depuis votre navigateur, ou envoyez un email à privacy@cyberbackgroundchecks.com',
})
