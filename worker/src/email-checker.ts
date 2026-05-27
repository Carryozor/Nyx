import https from 'node:https'
import type Database from 'better-sqlite3'
import { decryptJobKey, decrypt, type EncryptedBlob } from './crypto/aes.js'
import { config } from './config.js'

function httpsGet(url: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

async function checkSimpleLogin(
  db: Database.Database,
  profileId: string,
  apiKey: string,
): Promise<void> {
  try {
    let page = 0
    const MAX_PAGES = 20
    while (page < MAX_PAGES) {
      const response = await httpsGet(
        `https://app.simplelogin.io/api/aliases?page_id=${page}`,
        { 'Authentication': apiKey }
      ).catch(() => '{"aliases":[]}')
      const data = JSON.parse(response) as { aliases?: Array<{ id: number }> }
      const aliases = data.aliases ?? []
      if (aliases.length === 0) break

      for (const alias of aliases) {
        const emailsResp = await httpsGet(
          `https://app.simplelogin.io/api/aliases/${alias.id}/activities`,
          { 'Authentication': apiKey }
        ).catch(() => '{"activities":[]}')

        const emails = JSON.parse(emailsResp) as { activities?: Array<{ from_: string; subject?: string }> }

        const pending = db.prepare(`
          SELECT oor.id, oor.confirmation_pattern, b.name as broker_name
          FROM opt_out_requests oor
          JOIN brokers b ON b.id = oor.broker_id
          WHERE oor.profile_id = ? AND oor.status = 'awaiting_email'
        `).all(profileId) as Array<{ id: string; broker_name: string; confirmation_pattern: string | null }>

        for (const optOut of pending) {
          let pat: RegExp
          try {
            pat = optOut.confirmation_pattern
              ? new RegExp(optOut.confirmation_pattern, 'i')
              : new RegExp(optOut.broker_name.toLowerCase().replace(/\s+/g, '.*'), 'i')
          } catch {
            pat = new RegExp(optOut.broker_name.toLowerCase().replace(/\s+/g, '.*'), 'i')
          }
          for (const activity of emails.activities ?? []) {
            if (pat.test(activity.subject ?? '') || pat.test(activity.from_ ?? '')) {
              db.prepare(`UPDATE opt_out_requests SET status='confirmed', confirmed_at=? WHERE id=?`)
                .run(new Date().toISOString(), optOut.id)
              console.log(`[email-checker] Confirmed: ${optOut.broker_name} for profile ${profileId}`)
            }
          }
        }
      }
      page++
    }
  } catch (err) {
    console.error('[email-checker] SimpleLogin error:', err)
  }
}

export function startEmailChecker(db: Database.Database): void {
  const check = async () => {
    try {
      const configs = db.prepare(`
        SELECT ec.profile_id, ec.encrypted_credentials, sj.encrypted_job_key
        FROM email_configs ec
        JOIN scan_jobs sj ON sj.id = (
          SELECT id FROM scan_jobs
          WHERE profile_id = ec.profile_id AND status = 'done'
          ORDER BY created_at DESC LIMIT 1
        )
        WHERE ec.provider = 'simplelogin'
      `).all() as Array<{ profile_id: string; encrypted_credentials: string; encrypted_job_key: string }>

      for (const cfg of configs) {
        const piiKey = decryptJobKey(cfg.encrypted_job_key, config.WORKER_SECRET)
        const credBlob: EncryptedBlob = JSON.parse(cfg.encrypted_credentials)
        const credentials = JSON.parse(decrypt(credBlob, piiKey)) as Record<string, string>
        if (credentials.apiKey) {
          await checkSimpleLogin(db, cfg.profile_id, credentials.apiKey)
        }
      }
    } catch (err) {
      console.error('[email-checker] Error:', err)
    }
  }

  check()
  setInterval(check, 5 * 60 * 1000)
}
