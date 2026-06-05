import type { FastifyInstance } from 'fastify'
import { simpleParser } from 'mailparser'
import crypto from 'node:crypto'
import { getDb } from '../db/client.js'
import { config } from '../config.js'

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

// RFC-1918 + link-local + loopback
const PRIVATE_IP_RE = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|::1$|^fc|^fd)/i

function isTrustedUrl(urlStr: string): boolean {
  try {
    const { hostname } = new URL(urlStr)
    return TRUSTED_DOMAINS.has(hostname) && !PRIVATE_IP_RE.test(hostname)
  } catch { return false }
}

function extractConfirmationUrls(body: string): string[] {
  const urls = new Set<string>()
  const decoded = body
    .replace(/=\r?\n/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/=3D/gi, '=')

  for (const pattern of CONFIRMATION_URL_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of decoded.matchAll(pattern)) {
      const url = match[0].replace(/['">\s]+$/, '')
      if (isTrustedUrl(url)) urls.add(url)
    }
  }
  return [...urls]
}

async function clickConfirmationUrl(url: string): Promise<boolean> {
  let current = url
  const MAX_REDIRECTS = 5

  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    try {
      const res = await fetch(current, {
        method:   'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
          'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(15000),
      })

      if (res.ok) return true
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location')
        if (!location || !isTrustedUrl(location)) return false
        current = location
        continue
      }
      return false
    } catch { return false }
  }
  return false
}

interface CloudflareEmailPayload {
  'message-id'?: string
  to:             string
  from:           string
  subject:        string
  html:           string
}

export function registerWebhookRoutes(app: FastifyInstance): void {

  app.post('/webhook/email', async (req, reply) => {
    // Authenticate via Authorization: Bearer <secret> header (timing-safe)
    const authHeader = (req.headers['authorization'] ?? '') as string
    const token  = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    const secret = config.WEBHOOK_SECRET ?? ''

    const validLength = secret.length > 0 && token.length === secret.length
    if (
      !validLength ||
      !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret))
    ) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }

    const payload   = req.body as CloudflareEmailPayload
    const { to, from, subject, html: rawMime } = payload
    const messageId = payload['message-id'] ?? `${to}:${from}:${subject}`.slice(0, 200)

    if (!to || !rawMime) {
      return reply.send({ ok: true, skipped: 'missing to or body' })
    }

    const db = getDb()

    // Idempotence — skip duplicate message-ids
    const alreadySeen = db.prepare('SELECT 1 FROM webhook_seen WHERE message_id = ?').get(messageId)
    if (alreadySeen) {
      return reply.send({ ok: true, skipped: 'duplicate message-id already processed' })
    }
    db.prepare('INSERT OR IGNORE INTO webhook_seen (message_id, processed_at) VALUES (?, ?)')
      .run(messageId, new Date().toISOString())

    // Parse MIME
    let emailHtml = ''
    let emailText = ''
    try {
      const parsed = await simpleParser(rawMime)
      emailHtml = parsed.html || ''
      emailText = parsed.text || ''
    } catch {
      emailText = rawMime
    }
    const emailBody = emailHtml || emailText

    // Find opt-outs for this alias — include 'pending' to handle the race condition
    // where PeopleConnect sends the confirmation email before all scripts finish running.
    const pending = db.prepare(`
      SELECT oor.id, oor.broker_id, oor.status, oor.confirmation_pattern, b.name as broker_name
      FROM opt_out_requests oor
      JOIN brokers b ON b.id = oor.broker_id
      JOIN scan_jobs sj ON sj.profile_id = oor.profile_id
      WHERE oor.status IN ('awaiting_email', 'pending')
        AND LOWER(sj.confirmation_email) = LOWER(?)
    `).all(to) as Array<{
      id: string; broker_id: string; status: string; broker_name: string; confirmation_pattern: string | null
    }>

    if (pending.length === 0) {
      return reply.send({ ok: true, skipped: 'no pending opt-outs for this address' })
    }

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
      return reply.send({ ok: true, skipped: 'no pattern match' })
    }

    const urls = extractConfirmationUrls(emailBody)
    if (urls.length === 0) {
      return reply.send({ ok: true, skipped: 'no confirmation URLs found', matched: matched.length })
    }

    const clicked: string[] = []
    for (const url of urls) {
      const ok = await clickConfirmationUrl(url)
      if (ok) clicked.push(url)
    }

    if (clicked.length > 0) {
      const now = new Date().toISOString()
      for (const oo of matched) {
        db.prepare(`UPDATE opt_out_requests SET status='confirmed', confirmed_at=? WHERE id=?`)
          .run(now, oo.id)
      }
    }

    return reply.send({
      ok: true, to,
      matched:   matched.length,
      urls:      urls.length,
      clicked:   clicked.length,
      confirmed: clicked.length > 0 ? matched.length : 0,
    })
  })
}
