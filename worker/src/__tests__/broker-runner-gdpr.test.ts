import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'

// Detect whether the browser was launched — GDPR-email brokers must NOT launch one.
const launch = vi.fn()
vi.mock('playwright-extra', () => ({
  chromium: { use: vi.fn(), launch },
}))
vi.mock('puppeteer-extra-plugin-stealth', () => ({ default: vi.fn() }))

// Stub the sender so the dispatch can be tested without SMTP.
const sendGdprEmail = vi.fn().mockResolvedValue({ status: 'awaiting_email', confirmationPattern: 'solocal\\.com' })
vi.mock('../gdpr-email.js', () => ({ sendGdprEmail }))

function makeDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE brokers (id TEXT PRIMARY KEY, name TEXT, url TEXT, country TEXT,
      type TEXT, script_file TEXT, manual_guide TEXT, opt_out_email TEXT, gdpr_lang TEXT,
      audience TEXT DEFAULT 'private', active INTEGER DEFAULT 1);
    CREATE TABLE opt_out_requests (id TEXT PRIMARY KEY, profile_id TEXT, broker_id TEXT,
      status TEXT DEFAULT 'pending', submitted_at TEXT, confirmed_at TEXT, last_attempt TEXT,
      attempts INTEGER DEFAULT 0, screenshot TEXT, notes TEXT, confirmation_pattern TEXT,
      UNIQUE(profile_id, broker_id));
    CREATE TABLE scan_events (id TEXT PRIMARY KEY, job_id TEXT, event_type TEXT,
      payload TEXT, created_at TEXT, broadcast INTEGER DEFAULT 0);
    CREATE TABLE mail_log (id TEXT PRIMARY KEY, profile_id TEXT, broker_id TEXT, sent_at TEXT NOT NULL);
    CREATE TABLE profiles (id TEXT PRIMARY KEY, user_id TEXT, label TEXT, encrypted_pii TEXT, created_at TEXT, redirect_email TEXT);
    INSERT INTO brokers (id,name,country,type,script_file,opt_out_email,gdpr_lang)
      VALUES ('pagesjaunes','Pages Jaunes','FR','auto',NULL,'dpo@solocal.com','fr');
    INSERT INTO profiles (id, user_id, label) VALUES ('p1','u1','Test');
    INSERT INTO opt_out_requests (id, profile_id, broker_id) VALUES ('oo1','p1','pagesjaunes');
  `)
  return db
}

const pii = {
  firstName: 'Jean', lastName: 'Dupont', dob: '1985-06-15', email: 'alias@simplelogin.io',
  currentAddress: { street: '12 rue de la Paix', city: 'Paris', country: 'FR' },
}

describe('runBroker — GDPR email dispatch', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules() })

  it('routes opt_out_email brokers to the email sender without launching a browser', async () => {
    const db = makeDb()
    const { runBroker } = await import('../broker-runner.js')

    const result = await runBroker(db, 'job1', 'p1', 'pagesjaunes', pii)

    expect(launch).not.toHaveBeenCalled()
    expect(sendGdprEmail).toHaveBeenCalledTimes(1)
    // Reply-To must be the profile's confirmation alias
    expect(sendGdprEmail.mock.calls[0][2]).toBe('alias@simplelogin.io')
    expect(result.status).toBe('awaiting_email')

    const row = db.prepare('SELECT status, confirmation_pattern FROM opt_out_requests WHERE id=?').get('oo1') as { status: string; confirmation_pattern: string | null }
    expect(row.status).toBe('awaiting_email')
    expect(row.confirmation_pattern).toBe('solocal\\.com')
  })

  it('uses the profile redirect_email as Reply-To when set', async () => {
    const db = makeDb()
    db.prepare('UPDATE profiles SET redirect_email=? WHERE id=?').run('delegate@autre.fr', 'p1')
    const { runBroker } = await import('../broker-runner.js')
    await runBroker(db, 'job1', 'p1', 'pagesjaunes', pii)
    expect(sendGdprEmail.mock.calls[0][2]).toBe('delegate@autre.fr')
  })
})
