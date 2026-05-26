import { getDb, closeDb } from './db/client.js'
import { startJobRunner } from './job-runner.js'
import { startEmailChecker } from './email-checker.js'
import { startScheduler } from './scheduler.js'

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
