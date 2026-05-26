import { describe, it, expect } from 'vitest'
import { deriveKey, generateSalt } from '../crypto/kdf.js'

describe('deriveKey', () => {
  it('returns a 32-byte Buffer', async () => {
    const salt = generateSalt()
    const key = await deriveKey('my-password', salt)
    expect(key).toBeInstanceOf(Buffer)
    expect(key.length).toBe(32)
  })

  it('produces the same key for same password + salt', async () => {
    const salt = generateSalt()
    const k1 = await deriveKey('my-password', salt)
    const k2 = await deriveKey('my-password', salt)
    expect(k1.toString('hex')).toBe(k2.toString('hex'))
  })

  it('produces different keys for the same password with different salts', async () => {
    const k1 = await deriveKey('my-password', generateSalt())
    const k2 = await deriveKey('my-password', generateSalt())
    expect(k1.toString('hex')).not.toBe(k2.toString('hex'))
  })

  it('produces different keys for different passwords with same salt', async () => {
    const salt = generateSalt()
    const k1 = await deriveKey('password-a', salt)
    const k2 = await deriveKey('password-b', salt)
    expect(k1.toString('hex')).not.toBe(k2.toString('hex'))
  })
})
