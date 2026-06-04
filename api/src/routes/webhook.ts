import type { FastifyInstance } from 'fastify'
import { getDb } from '../db/client.js'
import { config } from '../config.js'

// URL patterns per broker family that contain confirmation links
const CONFIRMATION_URL_PATTERNS = [
  /https:\/\/suppression\.peopleconnect\.us\/[^\s"'<>]+/gi,
  /https:\/\/www\.beenverified\.com\/[^\s"'<>]*confirm[^\s"'<>]*/gi,
  /https:\/\/www\.instantcheckmate\.com\/[^\s"'<>]*confirm[^\s"'<>]*/gi,
  /https:\/\/www\.truthfinder\.com\/[^\s"'<>]*confirm[^\s"'<>]*/gi,
  /https:\/\/www\.intelius\.com\/[^\s"'<>]*confirm[^\s"'<>]*/gi,
  /https:\/\/www\.spokeo\.com\/[^\s"'<>]*confirm[^\s"'<>]*/gi,
  /https:\/\/[^\s"'<>]*\/[^\s"'<>]*(?:confirm|verify|opt.out|remove|suppress)[^\s"'<>]*/gi,
]

// Domains we trust enough to click automatically
const TRUSTED_DOMAINS = [
  'suppression.peopleconnect.us',
  'www.beenverified.com',
  'www.instantcheckmate.com',
  'www.truthfinder.com',
  'www.intelius.com',
  'www.spokeo.com',
  'www.peoplefinder.com',
  'www.checkpeople.com',
  'www.peoplelooker.com',
  'www.neighborwho.com',
  'www.ussearch.com',
  'www.zabasearch.com',
  'www.peoplesmart.com',
  'nuwber.com',
  'infotracer.com',
  'www.familytreenow.com',
]

interface SlWebhookEmail {
  from?:    { address?: string }
  subject?: string
  html?:    string
  text?:    string
}

interface SlWebhookPayload {
  alias?:   { address?: string; id?: number; note?: string }
  envelope?: { rcpt_tos?: string[] }
  email?:   SlWebhookEmail
  // Some SL versions use a different structure
  mail_options?: { to?: string }
  headers?:  Record<string, string>
}

function extractConfirmationUrls(body: string): string[] {
  const urls = new Set<string>()
  for (const pattern of CONFIRMATION_URL_PATTERNS) {
    pattern.lastIndex = 0
    const matches = body.match(pattern) ?? []
    for (const url of matches) {
      // Decode HTML entities (&amp; → &)
      const clean = url.replace(/&amp;/g, '&').replace(/&#38;/g, '&').trim()
      try {
        const parsed = new URL(clean)
        if (TRUSTED_DOMAINS.includes(parsed.hostname)) {
          urls.add(clean)
        }
      } catch { /* invalid URL, skip */ }
    }
  }
  return [...urls]
}

async function clickConfirmationUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    })
    return res.ok || res.status === 302 || res.status === 301
  } catch {
    return false
  }
}

export function registerWebhookRoutes(app: FastifyInstance): void {

  // POST /api/webhook/simplelogin?secret=XXX
  // Called by SimpleLogin when any email arrives at a @vidar.fr alias.
  // Extracts confirmation links from the email body and clicks them.
  app.post('/webhook/simplelogin', async (req, reply) => {
    // Validate secret — reject if misconfigured or wrong
    const secret = (req.query as Record<string, string>).secret
    if (!config.WEBHOOK_SECRET || secret !== config.WEBHOOK_SECRET) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }

    const payload = req.body as SlWebhookPayload

    // Resolve the alias address from different possible payload shapes
    const aliasAddress =
      payload.alias?.address ??
      payload.envelope?.rcpt_tos?.[0] ??
      payload.mail_options?.to

    const emailBody = payload.email?.html ?? payload.email?.text ?? ''
    const subject   = payload.email?.subject ?? ''
    const from      = payload.email?.from?.address ?? ''

    console.log(`[webhook] Email received — alias: ${aliasAddress}, from: ${from}, subject: ${subject}`)

    if (!aliasAddress || !emailBody) {
      return reply.send({ ok: true, skipped: 'no alias or empty body' })
    }

    // Find opt-out requests waiting on this alias
    const db = getDb()
    const pending = db.prepare(`
      SELECT oor.id, oor.broker_id, oor.confirmation_pattern, b.name as broker_name
      FROM opt_out_requests oor
      JOIN brokers b ON b.id = oor.broker_id
      JOIN scan_jobs sj ON sj.profile_id = oor.profile_id
      WHERE oor.status = 'awaiting_email'
        AND sj.confirmation_email = ?
    `).all(aliasAddress) as Array<{
      id: string
      broker_id: string
      broker_name: string
      confirmation_pattern: string | null
    }>

    if (pending.length === 0) {
      return reply.send({ ok: true, skipped: 'no pending opt-outs for this alias' })
    }

    // Check if any pending broker's pattern matches this email
    const matchingOptOuts = pending.filter(oo => {
      if (!oo.confirmation_pattern) {
        return new RegExp(oo.broker_name.toLowerCase().replace(/\s+/g, '.*'), 'i')
          .test(subject + ' ' + from)
      }
      try {
        return new RegExp(oo.confirmation_pattern, 'i').test(subject + ' ' + from)
      } catch {
        return false
      }
    })

    if (matchingOptOuts.length === 0) {
      console.log(`[webhook] No pattern match for alias ${aliasAddress}`)
      return reply.send({ ok: true, skipped: 'no pattern match' })
    }

    // Extract confirmation URLs from email body
    const urls = extractConfirmationUrls(emailBody)
    console.log(`[webhook] Found ${urls.length} confirmation URL(s):`, urls)

    if (urls.length === 0) {
      // Email arrived but no clickable link — mark as submitted at minimum
      console.log('[webhook] No confirmation URL found in body')
      return reply.send({ ok: true, skipped: 'no confirmation URL in body' })
    }

    // Click each URL
    const clicked: string[] = []
    for (const url of urls) {
      const ok = await clickConfirmationUrl(url)
      if (ok) clicked.push(url)
      console.log(`[webhook] Click ${url} → ${ok ? 'OK' : 'failed'}`)
    }

    // Mark matching opt-outs as confirmed
    if (clicked.length > 0) {
      const now = new Date().toISOString()
      for (const oo of matchingOptOuts) {
        db.prepare(`
          UPDATE opt_out_requests
          SET status = 'confirmed', confirmed_at = ?
          WHERE id = ?
        `).run(now, oo.id)
        console.log(`[webhook] Confirmed opt-out ${oo.broker_id} (${oo.id})`)
      }
    }

    return reply.send({
      ok:        true,
      alias:     aliasAddress,
      matched:   matchingOptOuts.length,
      urls:      urls.length,
      clicked:   clicked.length,
      confirmed: clicked.length > 0 ? matchingOptOuts.length : 0,
    })
  })
}
