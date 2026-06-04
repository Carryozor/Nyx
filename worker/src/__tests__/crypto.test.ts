import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { deriveKey, generateSalt } from '../crypto/kdf.js'
import { encrypt, decrypt, decryptJobKey } from '../crypto/aes.js'

describe('worker crypto', () => {
  it('derives a 32-byte key', async () => {
    const salt = generateSalt()
    const key  = await deriveKey('test-password', salt)
    expect(key).toBeInstanceOf(Buffer)
    expect(key.length).toBe(32)
  })

  it('round-trips encrypt/decrypt', async () => {
    const salt = generateSalt()
    const key  = await deriveKey('test-password', salt)
    const blob = encrypt('hello world', key, salt)
    expect(decrypt(blob, key)).toBe('hello world')
  })

  it('decryptJobKey round-trips with HKDF derivation', () => {
    const piiKey  = Buffer.alloc(32, 0x42)
    const secret  = 'b'.repeat(32)
    const saltHex = crypto.randomBytes(32).toString('hex')
    const hkdfKey = Buffer.from(
      crypto.hkdfSync('sha256', Buffer.from(secret), Buffer.from(saltHex, 'hex'), Buffer.alloc(0), 32)
    )
    const blob      = encrypt(piiKey.toString('hex'), hkdfKey, saltHex)
    const encrypted = JSON.stringify(blob)
    const recovered = decryptJobKey(encrypted, secret)
    expect(recovered.toString('hex')).toBe(piiKey.toString('hex'))
  })
})
