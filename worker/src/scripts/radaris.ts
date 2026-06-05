import type { BrokerScriptFn } from './_types.js'

// Radaris removal requires reCAPTCHA v2 (visible checkbox) on the final email step.
// The removal flow is:
//   1. POST /srv/a.go_search → /control/select-person?ff=...&fl=...&fs=...&fc=...
//   2. Select matching profile → /control-privacy?pid=NNNN&h=HASH
//   3. Click "START REMOVING" (COMPOSER wizard)
//   4. Enter email + solve reCAPTCHA v2 → submit
// Step 4 cannot be automated. User must visit radaris.com/control-privacy and complete manually.
export const run: BrokerScriptFn = async () => {
  return {
    status: 'manual',
    reason:
      'Radaris opt-out requires solving a reCAPTCHA v2 checkbox. ' +
      'Go to radaris.com/control-privacy, search for your name and city, ' +
      'select your record, enter your email, solve the CAPTCHA, and submit.',
  }
}
