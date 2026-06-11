import { describe, it, expect, vi } from 'vitest'
import type { DecryptedPII } from '../scripts/_types.js'
import { buildGdprEmail } from '../gdpr-templates.js'
import { sendGdprEmail } from '../gdpr-email.js'

const pii: DecryptedPII = {
  firstName: 'Jean',
  lastName: 'Dupont',
  dob: '1985-06-15',
  email: 'alias@simplelogin.io',
  currentAddress: { street: '12 rue de la Paix', city: 'Paris', zip: '75002', country: 'FR' },
}

describe('buildGdprEmail', () => {
  it('builds a French Article 17 erasure email with the data subject name and address', () => {
    const { subject, text } = buildGdprEmail({ name: 'Pages Jaunes', gdpr_lang: 'fr' }, pii)
    expect(subject).toMatch(/article 17/i)
    expect(text).toContain('Jean Dupont')
    expect(text).toContain('12 rue de la Paix')
    expect(text).toContain('Pages Jaunes')
  })

  it('localizes the subject per language', () => {
    expect(buildGdprEmail({ name: 'X', gdpr_lang: 'de' }, pii).subject).toMatch(/dsgvo/i)
    expect(buildGdprEmail({ name: 'X', gdpr_lang: 'es' }, pii).subject).toMatch(/rgpd/i)
    expect(buildGdprEmail({ name: 'X', gdpr_lang: 'it' }, pii).subject).toMatch(/gdpr/i)
    expect(buildGdprEmail({ name: 'X', gdpr_lang: 'nl' }, pii).subject).toMatch(/avg/i)
    expect(buildGdprEmail({ name: 'X', gdpr_lang: 'pl' }, pii).subject).toMatch(/rodo/i)
  })

  it('falls back to English when language is unknown or missing', () => {
    const { subject } = buildGdprEmail({ name: 'X', gdpr_lang: null }, pii)
    expect(subject).toMatch(/article 17/i)
    expect(subject).toMatch(/gdpr/i)
  })
})

describe('buildGdprEmail — company block', () => {
  const proPii: DecryptedPII = {
    ...pii,
    company: { name: 'ACME SARL', siren: '123456789', siret: '12345678900012', legalForm: 'SARL' },
  }

  it('includes the company block for a professional broker when company data is present', () => {
    const { text } = buildGdprEmail({ name: 'Altares', gdpr_lang: 'fr', audience: 'professional' }, proPii)
    expect(text).toContain('ACME SARL')
    expect(text).toContain('123456789')
    expect(text).toContain('12345678900012')
    expect(text).toContain('SARL')
  })

  it('includes the company block for a "both" broker', () => {
    const { text } = buildGdprEmail({ name: 'Pappers', gdpr_lang: 'fr', audience: 'both' }, proPii)
    expect(text).toContain('ACME SARL')
  })

  it('omits the company block for a private broker even if company data is present', () => {
    const { text } = buildGdprEmail({ name: 'Pages Blanches', gdpr_lang: 'fr', audience: 'private' }, proPii)
    expect(text).not.toContain('ACME SARL')
    expect(text).not.toContain('123456789')
  })

  it('omits the company block for a professional broker when no company data', () => {
    const { text } = buildGdprEmail({ name: 'Altares', gdpr_lang: 'fr', audience: 'professional' }, pii)
    expect(text).not.toContain('Raison sociale')
  })

  it('localizes the company block label', () => {
    const en = buildGdprEmail({ name: 'X', gdpr_lang: 'en', audience: 'professional' }, proPii).text
    expect(en).toMatch(/company/i)
    expect(en).toContain('ACME SARL')
  })

  it('only renders provided company fields', () => {
    const partial: DecryptedPII = { ...pii, company: { name: 'SoloCorp' } }
    const { text } = buildGdprEmail({ name: 'Altares', gdpr_lang: 'fr', audience: 'professional' }, partial)
    expect(text).toContain('SoloCorp')
    expect(text).not.toContain('SIREN')
  })
})

describe('sendGdprEmail', () => {
  const broker = { id: 'pagesjaunes', name: 'Pages Jaunes', opt_out_email: 'dpo@solocal.com', gdpr_lang: 'fr' }

  it('sends to the broker DPO with Reply-To = confirmation alias and returns awaiting_email', async () => {
    const sender = vi.fn().mockResolvedValue(undefined)

    const result = await sendGdprEmail(broker, pii, 'alias@simplelogin.io', sender)

    expect(sender).toHaveBeenCalledTimes(1)
    const msg = sender.mock.calls[0][0]
    expect(msg.to).toBe('dpo@solocal.com')
    expect(msg.replyTo).toBe('alias@simplelogin.io')
    expect(msg.subject).toMatch(/article 17/i)
    expect(msg.text).toContain('Jean Dupont')
    expect(result.status).toBe('awaiting_email')
    if (result.status === 'awaiting_email') {
      // confirmation_pattern is consumed as a RegExp by email-checker; must match the domain
      expect(new RegExp(result.confirmationPattern, 'i').test('noreply@solocal.com')).toBe(true)
    }
  })

  it('sends From the per-scan alias when it is on the configured sending domain', async () => {
    const sender = vi.fn().mockResolvedValue(undefined)
    // MAIL_FROM default in tests is privacy@localhost → domain "localhost".
    const piiOnDomain: DecryptedPII = { ...pii, email: 'scan-xyz@localhost' }
    await sendGdprEmail(broker, piiOnDomain, 'delegate@autre.fr', sender)
    const msg = sender.mock.calls[0][0]
    expect(msg.from).toBe('scan-xyz@localhost')
    expect(msg.replyTo).toBe('delegate@autre.fr')
  })

  it('falls back to the instance sender when the alias is on another domain', async () => {
    const sender = vi.fn().mockResolvedValue(undefined)
    await sendGdprEmail(broker, pii, 'delegate@autre.fr', sender) // pii.email = alias@simplelogin.io
    expect(sender.mock.calls[0][0].from).not.toBe('alias@simplelogin.io')
  })

  it('fails gracefully when no email transport is configured', async () => {
    const result = await sendGdprEmail(broker, pii, 'alias@simplelogin.io', null)
    expect(result.status).toBe('failed')
    if (result.status === 'failed') expect(result.reason).toMatch(/transport email/i)
  })

  it('returns failed when the transport throws', async () => {
    const sender = vi.fn().mockRejectedValue(new Error('connection refused'))
    const result = await sendGdprEmail(broker, pii, undefined, sender)
    expect(result.status).toBe('failed')
    if (result.status === 'failed') expect(result.reason).toMatch(/connection refused/i)
  })
})
