import type { BrokerScriptFn } from './_types.js'

// MyLife blocks all server IPs via Cloudflare (403 on every URL).
// Manual opt-out required from user's browser.
export const run: BrokerScriptFn = async () => ({
  status: 'manual',
  reason:
    'MyLife bloque les IP serveur (Cloudflare 403). ' +
    'Visitez mylife.com/privacy/remove depuis votre navigateur. ' +
    'Ou email : privacy@mylife.com — objet : "Remove My Information".',
})
