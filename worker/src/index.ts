import { getDb, closeDb } from './db/client.js'
import { startJobRunner } from './job-runner.js'
import { startEmailChecker } from './email-checker.js'
import { startScheduler } from './scheduler.js'

// Playwright closes browsers on timeout while orphaned script promises are still running.
// Those promises throw cdpSession errors that would kill the process without this guard.
process.on('uncaughtException', (err: Error) => {
  const msg = err.message ?? ''
  if (
    msg.includes('cdpSession') ||
    msg.includes('Target page') ||
    msg.includes('browser has been closed') ||
    msg.includes('Target closed')
  ) return // expected after broker timeout — browser was closed while script ran
  console.error('[worker] uncaughtException:', err)
})
process.on('unhandledRejection', (reason: unknown) => {
  const msg = String(reason)
  if (
    msg.includes('cdpSession') ||
    msg.includes('Target page') ||
    msg.includes('browser has been closed') ||
    msg.includes('Target closed')
  ) return
  console.error('[worker] unhandledRejection:', reason)
})

console.log('[nyx-worker] starting...')

const db = getDb()

startScheduler(db)
startEmailChecker(db)
startJobRunner(db)

console.log('[nyx-worker] ready — polling for jobs every 5s')

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`[nyx-worker] ${signal} received, shutting down`)
    closeDb()
    process.exit(0)
  })
}
