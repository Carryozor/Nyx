import { buildApp } from './app.js'
import { runMigrations } from './db/migrate.js'
import { closeDb } from './db/client.js'
import { config } from './config.js'
import { startBroadcastLoop } from './routes/ws.js'

runMigrations()

const app = await buildApp()

app.get('/health', async () => ({ status: 'ok', version: '1.0.0' }))

await app.listen({ port: config.PORT, host: '0.0.0.0' })
console.log(`[nyx-api] listening on :${config.PORT}`)

startBroadcastLoop()

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await app.close()
    closeDb()
    process.exit(0)
  })
}
