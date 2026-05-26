import Fastify, { type FastifyInstance } from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifyCors   from '@fastify/cors'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifyWebsocket from '@fastify/websocket'
import { config } from './config.js'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.NODE_ENV !== 'test',
  })

  await app.register(fastifyCookie)
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
  const { registerInvitationRoutes }  = await import('./routes/invitations.js')
  const { registerBrokerRoutes }      = await import('./routes/brokers.js')
  const { registerScanRoutes }        = await import('./routes/scans.js')
  const { registerOptOutRoutes }      = await import('./routes/opt-outs.js')
  const { registerEmailConfigRoutes } = await import('./routes/email-configs.js')
  const { registerScheduleRoutes }    = await import('./routes/schedules.js')
  const { registerWsRoutes }          = await import('./routes/ws.js')

  registerAuthRoutes(app)
  registerProfileRoutes(app)
  registerInvitationRoutes(app)
  registerBrokerRoutes(app)
  registerScanRoutes(app)
  registerOptOutRoutes(app)
  registerEmailConfigRoutes(app)
  registerScheduleRoutes(app)
  registerWsRoutes(app)

  if (config.NODE_ENV === 'production') {
    const { default: fastifyStatic } = await import('@fastify/static')
    const path = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const __dirname = path.dirname(fileURLToPath(import.meta.url))

    await app.register(fastifyStatic, {
      root:            path.resolve(__dirname, '../../', config.FRONTEND_DIST),
      prefix:          '/',
      decorateReply:   false,
    })
    app.setNotFoundHandler(async (_req, reply) => {
      return reply.sendFile('index.html')
    })
  }

  return app
}
