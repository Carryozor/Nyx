import type Database from 'better-sqlite3'

/** Number of GDPR mails logged since `sinceIso` (rolling-window quota counter). */
export function countSentSince(db: Database.Database, sinceIso: string): number {
  const row = db.prepare('SELECT count(*) as n FROM mail_log WHERE sent_at >= ?').get(sinceIso) as { n: number }
  return row.n
}

/** Mails a scan will send = brokers in scope that have a DPO opt-out email. */
export function estimateEmails(brokers: { opt_out_email: string | null }[]): number {
  return brokers.filter(b => b.opt_out_email).length
}

/** ISO timestamp 24h ago — the rolling daily-quota window boundary. */
export function windowStart(now: number = Date.now()): string {
  return new Date(now - 24 * 3600 * 1000).toISOString()
}
