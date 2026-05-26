import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from '../crypto/aes.js'
import { deriveKey, generateSalt } from '../crypto/kdf.js'
import type { EncryptedBlob } from '../types.js'

describe('AES-256-GCM', () => {
  it('round-trips a JSON payload', async () => {
    const salt = generateSalt()
    const key  = await deriveKey('test-password', salt)
    const payload = { name: 'Alice', address: '123 Main St' }

    const blob: EncryptedBlob = encrypt(JSON.stringify(payload), key, salt)
    const plain = decrypt(blob, key)

    expect(JSON.parse(plain)).toEqual(payload)
  })

  it('produces different ciphertexts each call (random IV)', async () => {
    const salt = generateSalt()
    const key  = await deriveKey('test-password', salt)

    const b1 = encrypt('hello', key, salt)
    const b2 = encrypt('hello', key, salt)

    expect(b1.iv).not.toBe(b2.iv)
    expect(b1.ciphertext).not.toBe(b2.ciphertext)
  })

  it('throws on wrong key', async () => {
    const salt  = generateSalt()
    const key1  = await deriveKey('password-1', salt)
    const key2  = await deriveKey('password-2', salt)

    const blob = encrypt('secret', key1, salt)
    expect(() => decrypt(blob, key2)).toThrow()
  })

  it('throws on tampered ciphertext', async () => {
    const salt = generateSalt()
    const key  = await deriveKey('test-password', salt)
    const blob = encrypt('secret', key, salt)

    const tampered: EncryptedBlob = {
      ...blob,
      ciphertext: 'deadbeef' + blob.ciphertext.slice(8),
    }
    expect(() => decrypt(tampered, key)).toThrow()
  })
})
