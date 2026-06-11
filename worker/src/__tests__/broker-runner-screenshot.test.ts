import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'

function makeDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE brokers (id TEXT PRIMARY KEY, name TEXT, url TEXT, country TEXT,
      type TEXT, script_file TEXT, manual_guide TEXT, opt_out_email TEXT, gdpr_lang TEXT,
      audience TEXT DEFAULT 'private', active INTEGER DEFAULT 1);
    CREATE TABLE profiles (id TEXT PRIMARY KEY, user_id TEXT, label TEXT,
      encrypted_pii TEXT, created_at TEXT);
    CREATE TABLE opt_out_requests (id TEXT PRIMARY KEY, profile_id TEXT,
      broker_id TEXT, status TEXT DEFAULT 'pending', submitted_at TEXT,
      confirmed_at TEXT, last_attempt TEXT, attempts INTEGER DEFAULT 0,
      screenshot TEXT, notes TEXT, confirmation_pattern TEXT,
      UNIQUE(profile_id, broker_id));
    CREATE TABLE scan_jobs (id TEXT PRIMARY KEY, profile_id TEXT, broker_ids TEXT,
      status TEXT DEFAULT 'queued', encrypted_job_key TEXT, confirmation_email TEXT,
      created_at TEXT, started_at TEXT, finished_at TEXT, created_by TEXT);
    CREATE TABLE scan_events (id TEXT PRIMARY KEY, job_id TEXT, event_type TEXT,
      payload TEXT, created_at TEXT, broadcast INTEGER DEFAULT 0);
    INSERT INTO brokers (id,name,url,country,type,script_file,manual_guide,active)
      VALUES ('testbroker','Test','http://test.com','US','auto','_stub.js',NULL,1);
    INSERT INTO profiles VALUES ('p1','u1','Test','{}','2026-01-01');
    INSERT INTO opt_out_requests (id, profile_id, broker_id) VALUES ('oo1','p1','testbroker');
  `)
  return db
}

vi.mock('playwright-extra', () => ({
  chromium: {
    use: vi.fn(),
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        route: vi.fn().mockResolvedValue(undefined),
        newPage: vi.fn().mockResolvedValue({
          setViewportSize: vi.fn(),
          setExtraHTTPHeaders: vi.fn(),
          goto: vi.fn().mockResolvedValue(null),
        }),
      }),
      close: vi.fn(),
    }),
  },
}))
vi.mock('puppeteer-extra-plugin-stealth', () => ({ default: vi.fn() }))

describe('broker-runner screenshot storage', () => {
  beforeEach(() => { vi.resetModules() })

  it('stores jobId in opt_out_requests.screenshot after running a broker', async () => {
    const db = makeDb()
    db.prepare("INSERT INTO scan_jobs VALUES ('job1','p1',NULL,'queued','{}',NULL,'2026-01-01',NULL,NULL,'u1')").run()

    const { runBroker } = await import('../broker-runner.js')
    const pii = {
      firstName: 'Alice', lastName: 'Dupont', dob: '1990-01-01',
      currentAddress: { street: '1 rue de la Paix', city: 'Paris', country: 'FR' },
    }

    await runBroker(db, 'job1', 'p1', 'testbroker', pii)

    const row = db.prepare('SELECT screenshot FROM opt_out_requests WHERE id = ?').get('oo1') as { screenshot: string | null }
    expect(row.screenshot).toBe('job1')
  })

  it('overwrites existing screenshot job_id with the latest run (always shows fresh screenshots)', async () => {
    const db = makeDb()
    db.prepare('UPDATE opt_out_requests SET screenshot = ? WHERE id = ?').run('job0', 'oo1')
    db.prepare("INSERT INTO scan_jobs VALUES ('job1','p1',NULL,'queued','{}',NULL,'2026-01-01',NULL,NULL,'u1')").run()

    const { runBroker } = await import('../broker-runner.js')
    const pii = {
      firstName: 'Alice', lastName: 'Dupont', dob: '1990-01-01',
      currentAddress: { street: '1 rue de la Paix', city: 'Paris', country: 'FR' },
    }

    await runBroker(db, 'job1', 'p1', 'testbroker', pii)

    const row = db.prepare('SELECT screenshot FROM opt_out_requests WHERE id = ?').get('oo1') as { screenshot: string | null }
    // Always updated to the latest job so screenshots reflect the current scan
    expect(row.screenshot).toBe('job1')
  })
})
