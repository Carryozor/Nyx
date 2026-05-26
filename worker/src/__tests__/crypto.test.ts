import { describe, it, expect } from 'vitest'
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

  it('decryptJobKey round-trips', () => {
    const piiKey    = Buffer.alloc(32, 0x42)
    const secret    = 'b'.repeat(32)
    const workerKey = Buffer.from(secret.padEnd(32, '0').slice(0, 32))
    const salt      = Buffer.from(secret).toString('hex').slice(0, 64).padEnd(64, '0')
    const blob      = encrypt(piiKey.toString('hex'), workerKey, salt)
    const encrypted = JSON.stringify(blob)
    const recovered = decryptJobKey(encrypted, secret)
    expect(recovered.toString('hex')).toBe(piiKey.toString('hex'))
  })
})
