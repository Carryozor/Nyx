import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '../crypto/argon.js'

describe('argon2id', () => {
  it('hashes a password to a non-plaintext string', async () => {
    const hash = await hashPassword('correct-horse-battery')
    expect(hash).not.toBe('correct-horse-battery')
    expect(hash.length).toBeGreaterThan(50)
  })

  it('verifies the correct password', async () => {
    const hash = await hashPassword('correct-horse-battery')
    const ok = await verifyPassword('correct-horse-battery', hash)
    expect(ok).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct-horse-battery')
    const ok = await verifyPassword('wrong-password', hash)
    expect(ok).toBe(false)
  })

  it('produces different hashes for the same password (random salt)', async () => {
    const h1 = await hashPassword('same-password')
    const h2 = await hashPassword('same-password')
    expect(h1).not.toBe(h2)
  })
})
