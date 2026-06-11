import Fastify, { type FastifyInstance } from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifyCors   from '@fastify/cors'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifyWebsocket from '@fastify/websocket'
import fastifyHelmet from '@fastify/helmet'
import { config } from './config.js'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.NODE_ENV !== 'test',
  })

  await app.register(fastifyCookie)
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false,  // SPA with inline Vite scripts — configure separately if needed
  })
  await app.register(fastifyCors, {
    origin:      config.NODE_ENV === 'production' ? false : true,
    credentials: true,
  })
  await app.register(fastifyRateLimit, {
    max:        100,
    timeWindow: '1 minute',
  })
  await app.register(fastifyWebsocket)

  const { registerAuthRoutes }        = await import('./auth/routes.js')
  const { registerProfileRoutes }     = await import('./routes/profiles.js')
  const { registerShareRoutes }       = await import('./routes/shares.js')
  const { registerInvitationRoutes }  = await import('./routes/invitations.js')
  const { registerBrokerRoutes }      = await import('./routes/brokers.js')
  const { registerScanRoutes }        = await import('./routes/scans.js')
  const { registerOptOutRoutes }      = await import('./routes/opt-outs.js')
  const { registerEmailConfigRoutes } = await import('./routes/email-configs.js')
  const { registerScheduleRoutes }    = await import('./routes/schedules.js')
  const { registerWsRoutes }          = await import('./routes/ws.js')
  const { registerSimpleLoginRoutes } = await import('./routes/simplelogin.js')
  const { registerScreenshotRoutes }  = await import('./routes/screenshots.js')
  const { registerWebhookRoutes }     = await import('./routes/webhook.js')

  app.get('/health', async () => ({ status: 'ok', version: '1.0.0' }))

  // WebSocket stays at /ws (browser connects via window.location.host + '/ws')
  registerWsRoutes(app)

  // All REST API routes under /api so /profiles/:id etc. don't shadow SPA routes
  await app.register(async (api) => {
    registerAuthRoutes(api)
    registerProfileRoutes(api)
    registerShareRoutes(api)
    registerInvitationRoutes(api)
    registerBrokerRoutes(api)
    registerScanRoutes(api)
    registerOptOutRoutes(api)
    registerEmailConfigRoutes(api)
    registerScheduleRoutes(api)
    registerSimpleLoginRoutes(api)
    registerScreenshotRoutes(api)
    registerWebhookRoutes(api)
  }, { prefix: '/api' })

  if (config.NODE_ENV === 'production') {
    const { default: fastifyStatic } = await import('@fastify/static')
    const path = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const __dirname = path.dirname(fileURLToPath(import.meta.url))

    const distRoot = path.resolve(config.FRONTEND_DIST)
    await app.register(fastifyStatic, {
      root:   distRoot,
      prefix: '/',
    })
    app.setNotFoundHandler(async (_req, reply) => {
      return reply.sendFile('index.html', distRoot)
    })
  }

  return app
}
