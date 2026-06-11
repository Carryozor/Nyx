import { z } from 'zod'

const schema = z.object({
  DB_PATH:        z.string().default('/data/nyx.db'),
  WORKER_SECRET:  z.string().min(32),
  NODE_ENV:       z.enum(['development', 'production', 'test']).default('development'),
  MAX_CONCURRENT: z.coerce.number().default(3),
  JOB_POLL_MS:    z.coerce.number().default(5000),
  SCREENSHOT_DIR: z.string().default('/data/screenshots'),
  // Outbound email for GDPR erasure requests. All optional: when no transport is
  // configured, GDPR-email brokers fail gracefully and Playwright scrapers are unaffected.
  // From address (must be an onboarded/verified domain on the chosen provider).
  MAIL_FROM:           z.string().default('privacy@localhost'),
  // Preferred: Cloudflare Email Service REST API (reply_to is a first-class field).
  CF_EMAIL_ACCOUNT_ID: z.string().optional(),
  CF_EMAIL_API_TOKEN:  z.string().optional(),
  // Fallback: generic SMTP (nodemailer).
  SMTP_HOST:           z.string().optional(),
  SMTP_PORT:           z.coerce.number().default(587),
  SMTP_USER:           z.string().optional(),
  SMTP_PASS:           z.string().optional(),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('[worker] Invalid environment variables:', parsed.error.format())
  process.exit(1)
}

export const config = parsed.data
export type Config = typeof config
