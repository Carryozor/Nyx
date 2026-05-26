import { z } from 'zod'

const schema = z.object({
  DB_PATH:        z.string().default('/data/nyx.db'),
  WORKER_SECRET:  z.string().min(32),
  NODE_ENV:       z.enum(['development', 'production', 'test']).default('development'),
  MAX_CONCURRENT: z.coerce.number().default(3),
  JOB_POLL_MS:    z.coerce.number().default(5000),
  SCREENSHOT_DIR: z.string().default('/data/screenshots'),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('[worker] Invalid environment variables:', parsed.error.format())
  process.exit(1)
}

export const config = parsed.data
export type Config = typeof config
