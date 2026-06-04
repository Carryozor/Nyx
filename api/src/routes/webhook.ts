import type { FastifyInstance } from 'fastify'
import { simpleParser } from 'mailparser'
import { getDb } from '../db/client.js'
import { config } from '../config.js'

// Confirmation URL patterns per broker family
const CONFIRMATION_URL_PATTERNS = [
  /https:\/\/suppression\.peopleconnect\.us\/[^\s"'<>=]+/gi,
  /https:\/\/www\.beenverified\.com\/[^\s"'<>]*confirm[^\s"'<>]*/gi,
  /https:\/\/www\.instantcheckmate\.com\/[^\s"'<>]*confirm[^\s"'<>]*/gi,
  /https:\/\/www\.truthfinder\.com\/[^\s"'<>]*confirm[^\s"'<>]*/gi,
  /https:\/\/www\.intelius\.com\/[^\s"'<>]*confirm[^\s"'<>]*/gi,
  /https:\/\/www\.spokeo\.com\/[^\s"'<>]*confirm[^\s"'<>]*/gi,
  /https:\/\/[^\s"'<>]*(?:confirm|verify|opt-out|suppress)[^\s"'<>]*/gi,
]

const TRUSTED_DOMAINS = new Set([
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
])

function extractConfirmationUrls(body: string): string[] {
  const urls = new Set<string>()
  // Also decode quoted-printable soft line breaks before searching
  const decoded = body
    .replace(/=\r?\n/g, '')           // QP soft line breaks
    .replace(/&amp;/g, '&')           // HTML entities
    .replace(/&#38;/g, '&')
    .replace(/=3D/gi, '=')            // QP-encoded = sign

  for (const pattern of CONFIRMATION_URL_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of decoded.matchAll(pattern)) {
      const url = match[0].replace(/['">\s]+$/, '') // strip trailing junk
      try {
        const { hostname } = new URL(url)
        if (TRUSTED_DOMAINS.has(hostname)) urls.add(url)
      } catch { /* invalid URL */ }
    }
  }
  return [...urls]
}

async function clickConfirmationUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method:   'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    })
    return res.ok || res.status === 301 || res.status === 302
  } catch {
    return false
  }
}

// Payload from the Cloudflare Email Worker
interface CloudflareEmailPayload {
  to:      string
  from:    string
  subject: string
  html:    string  // raw MIME text (URLs appear verbatim despite the field name)
}

export function registerWebhookRoutes(app: FastifyInstance): void {

  // POST /api/webhook/email?secret=XXX
  // Called by the Cloudflare Email Worker when any email arrives at @vidar.fr.
  // Extracts confirmation links and clicks them automatically.
  app.post('/webhook/email', async (req, reply) => {
    const secret = (req.query as Record<string, string>).secret
    if (!config.WEBHOOK_SECRET || secret !== config.WEBHOOK_SECRET) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }

    const { to, from, subject, html: rawMime } = req.body as CloudflareEmailPayload

    console.log(`[webhook] email → to:${to} from:${from} subject:${subject?.slice(0, 60)}`)

    if (!to || !rawMime) {
      return reply.send({ ok: true, skipped: 'missing to or body' })
    }

    // Parse the raw MIME email to extract decoded HTML/text bodies
    let emailHtml = ''
    let emailText = ''
    try {
      const parsed = await simpleParser(rawMime)
      emailHtml = parsed.html || ''
      emailText = parsed.text || ''
    } catch {
      // fallback: treat raw content as plain text
      emailText = rawMime
    }
    const emailBody = emailHtml || emailText

    // Find opt-out requests waiting on this alias
    const db = getDb()
    const pending = db.prepare(`
      SELECT oor.id, oor.broker_id, oor.confirmation_pattern, b.name as broker_name
      FROM opt_out_requests oor
      JOIN brokers b ON b.id = oor.broker_id
      JOIN scan_jobs sj ON sj.profile_id = oor.profile_id
      WHERE oor.status = 'awaiting_email'
        AND LOWER(sj.confirmation_email) = LOWER(?)
    `).all(to) as Array<{
      id: string
      broker_id: string
      broker_name: string
      confirmation_pattern: string | null
    }>

    if (pending.length === 0) {
      console.log(`[webhook] no pending opt-outs for ${to}`)
      return reply.send({ ok: true, skipped: 'no pending opt-outs for this address' })
    }

    // Filter by pattern (subject or sender must match)
    const haystack = `${subject} ${from}`.toLowerCase()
    const matched = pending.filter(oo => {
      try {
        const pat = oo.confirmation_pattern
          ? new RegExp(oo.confirmation_pattern, 'i')
          : new RegExp(oo.broker_name.toLowerCase().replace(/\s+/g, '.*'), 'i')
        return pat.test(haystack)
      } catch { return false }
    })

    if (matched.length === 0) {
      console.log(`[webhook] no pattern match for subject:"${subject}" from:${from}`)
      return reply.send({ ok: true, skipped: 'no pattern match' })
    }

    // Extract confirmation URLs from the decoded email body
    const urls = extractConfirmationUrls(emailBody)
    console.log(`[webhook] found ${urls.length} confirmation URL(s):`, urls)

    if (urls.length === 0) {
      return reply.send({ ok: true, skipped: 'no confirmation URLs found', matched: matched.length })
    }

    // Click each URL
    const clicked: string[] = []
    for (const url of urls) {
      const ok = await clickConfirmationUrl(url)
      console.log(`[webhook] click ${url} → ${ok ? 'OK' : 'FAILED'}`)
      if (ok) clicked.push(url)
    }

    // Confirm matching opt-outs
    if (clicked.length > 0) {
      const now = new Date().toISOString()
      for (const oo of matched) {
        db.prepare(`UPDATE opt_out_requests SET status='confirmed', confirmed_at=? WHERE id=?`)
          .run(now, oo.id)
        console.log(`[webhook] confirmed ${oo.broker_id} (${oo.id})`)
      }
    }

    return reply.send({
      ok:        true,
      to,
      matched:   matched.length,
      urls:      urls.length,
      clicked:   clicked.length,
      confirmed: clicked.length > 0 ? matched.length : 0,
    })
  })
}
