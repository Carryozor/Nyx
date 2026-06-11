import { describe, it, expect, beforeAll, afterAll } from 'vitest'

describe('broker audience classification (migration 023)', () => {
  beforeAll(() => {
    process.env.DB_PATH       = ':memory:'
    process.env.JWT_SECRET    = 'a'.repeat(32)
    process.env.WORKER_SECRET = 'b'.repeat(32)
  })

  it('adds an audience column defaulting to private', async () => {
    const { runMigrations } = await import('../db/migrate.js')
    const { getDb, closeDb } = await import('../db/client.js')
    runMigrations()
    const db = getDb()

    const cols = (db.prepare('PRAGMA table_info(brokers)').all() as { name: string }[]).map(c => c.name)
    expect(cols).toContain('audience')

    // A plain people-search broker stays private.
    const pb = db.prepare("SELECT audience FROM brokers WHERE id='pagesblanches'").get() as { audience: string }
    expect(pb.audience).toBe('private')

    closeDb()
  })

  it('classifies B2B French brokers as professional or both', async () => {
    const { runMigrations } = await import('../db/migrate.js')
    const { getDb, closeDb } = await import('../db/client.js')
    runMigrations()
    const db = getDb()

    const audienceOf = (id: string) =>
      (db.prepare('SELECT audience FROM brokers WHERE id=?').get(id) as { audience: string } | undefined)?.audience

    // Pure B2B → professional
    expect(audienceOf('kompass-fr')).toBe('professional')
    expect(audienceOf('manageo')).toBe('professional')
    expect(audienceOf('nomination')).toBe('professional')

    // Company data + director-as-individual → both
    expect(audienceOf('societe-com')).toBe('both')
    expect(audienceOf('verif-com')).toBe('both')
    expect(audienceOf('infogreffe')).toBe('both')
    expect(audienceOf('pappers')).toBe('both')

    // Universal directories → both
    expect(audienceOf('pagesjaunes')).toBe('both')

    closeDb()
  })

  it('adds Altares as an active professional auto broker with a confirmed DPO address', async () => {
    const { runMigrations } = await import('../db/migrate.js')
    const { getDb, closeDb } = await import('../db/client.js')
    runMigrations()
    const db = getDb()

    const altares = db.prepare(
      "SELECT type, audience, active, opt_out_email, gdpr_lang FROM brokers WHERE id='altares'"
    ).get() as { type: string; audience: string; active: number; opt_out_email: string; gdpr_lang: string } | undefined

    expect(altares).toBeTruthy()
    expect(altares!.audience).toBe('professional')
    expect(altares!.type).toBe('auto')
    expect(altares!.active).toBe(1)
    expect(altares!.opt_out_email).toBe('dpo@altares.com')
    expect(altares!.gdpr_lang).toBe('fr')

    closeDb()
  })

  it('rejects an invalid audience value via the CHECK constraint', async () => {
    const { runMigrations } = await import('../db/migrate.js')
    const { getDb, closeDb } = await import('../db/client.js')
    runMigrations()
    const db = getDb()

    expect(() =>
      db.prepare("UPDATE brokers SET audience='nonsense' WHERE id='pagesblanches'").run()
    ).toThrow()

    closeDb()
  })
})
