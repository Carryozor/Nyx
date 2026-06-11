import nodemailer from 'nodemailer'
import { config } from './config.js'
import { buildGdprEmail } from './gdpr-templates.js'
import type { DecryptedPII, OptOutResult } from './scripts/_types.js'

export interface GdprBroker {
  id: string
  name: string
  opt_out_email: string
  gdpr_lang?: string | null
  audience?: 'private' | 'professional' | 'both' | null
}

export interface OutboundMessage {
  from: string
  to: string
  subject: string
  text: string
  replyTo?: string
}

/** A transport-agnostic email sender. Throws on failure. */
export type MailSender = (msg: OutboundMessage) => Promise<void>

/**
 * Cloudflare Email Service REST transport.
 *
 * Preferred over SMTP because Cloudflare treats Reply-To as a first-class API field
 * (`reply_to`) and rejects it as a raw header — and our confirmation loop relies on
 * Reply-To pointing at the SimpleLogin alias that email-checker monitors.
 */
const cloudflareRestSender: MailSender = async (msg) => {
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.CF_EMAIL_ACCOUNT_ID}/email/sending/send`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.CF_EMAIL_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: msg.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
    }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Cloudflare Email API ${res.status}: ${body.slice(0, 200)}`)
  }
}

/** Generic SMTP transport (nodemailer) — fallback for non-Cloudflare setups. */
let cachedTransport: nodemailer.Transporter | undefined
const smtpSender: MailSender = async (msg) => {
  if (!cachedTransport) {
    cachedTransport = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: { user: config.SMTP_USER as string, pass: config.SMTP_PASS as string },
    })
  }
  await cachedTransport.sendMail({
    from: msg.from,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
  })
}

/** Resolve the configured outbound sender, or null when none is configured. */
export function resolveSender(): MailSender | null {
  if (config.CF_EMAIL_ACCOUNT_ID && config.CF_EMAIL_API_TOKEN) return cloudflareRestSender
  if (config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS) return smtpSender
  return null
}

/**
 * Send a GDPR Article 17 erasure email to a broker's DPO address.
 *
 * Reply-To is set to the profile's confirmation alias so the broker's acknowledgement
 * lands in the SimpleLogin alias that email-checker already monitors → status becomes
 * 'confirmed' via the existing loop.
 */
export async function sendGdprEmail(
  broker: GdprBroker,
  pii: DecryptedPII,
  replyTo: string | undefined,
  sender: MailSender | null = resolveSender(),
): Promise<OptOutResult> {
  if (!sender) {
    return { status: 'failed', reason: 'aucun transport email configuré — définir CF_EMAIL_ACCOUNT_ID/CF_EMAIL_API_TOKEN (Cloudflare) ou SMTP_HOST/SMTP_USER/SMTP_PASS' }
  }

  const { subject, text } = buildGdprEmail(broker, pii)

  try {
    await sender({ from: config.MAIL_FROM, to: broker.opt_out_email, subject, text, replyTo })
  } catch (err) {
    return { status: 'failed', reason: `échec envoi email RGPD à ${broker.opt_out_email}: ${String(err)}` }
  }

  // confirmation_pattern is consumed as a case-insensitive RegExp by email-checker;
  // matching the broker's email domain catches its reply/acknowledgement.
  const domain = broker.opt_out_email.split('@')[1] ?? broker.name
  const confirmationPattern = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return { status: 'awaiting_email', confirmationPattern }
}
