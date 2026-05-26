import type { BrokerScriptFn } from './_types.js'

export const run: BrokerScriptFn = async ({ brokerId }) => {
  return { status: 'failed', reason: `Script for ${brokerId} not yet implemented` }
}
