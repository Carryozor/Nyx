import { z } from 'zod'

const schema = z.object({
  DB_PATH:        z.string().default('/data/nyx.db'),
  JWT_SECRET:     z.string().min(32),
  WORKER_SECRET:  z.string().min(32),
  PORT:           z.coerce.number().default(3000),
  NODE_ENV:       z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_DIST:  z.string().default('../frontend/dist'),
  COOKIE_SECURE:  z.coerce.boolean().default(false),
  SCREENSHOT_DIR:  z.string().default('/data/screenshots'),
  WEBHOOK_SECRET:  z.string().min(16).optional(),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format())
  process.exit(1)
}

export const config = parsed.data
export type Config = typeof config
