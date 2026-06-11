import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { decryptWithWorkerSecret } from '../crypto/aes.js'
import type { EncryptedBlob } from '../crypto/aes.js'

// Mirrors api/src/crypto/aes.ts → encryptWithWorkerSecret, so this test guards the
// cross-package contract used to store the SimpleLogin API key.
function encryptWithWorkerSecret(plaintext: string, workerSecret: string): EncryptedBlob {
  const salt = crypto.randomBytes(32).toString('hex')
  const key = Buffer.from(crypto.hkdfSync('sha256', Buffer.from(workerSecret), Buffer.from(salt, 'hex'), Buffer.alloc(0), 32))
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return { salt, iv: iv.toString('hex'), ciphertext: ciphertext.toString('hex'), authTag: cipher.getAuthTag().toString('hex') }
}

describe('decryptWithWorkerSecret', () => {
  const secret = 'w'.repeat(32)

  it('round-trips data encrypted with the worker secret (SimpleLogin credential blob)', () => {
    const blob = encryptWithWorkerSecret(JSON.stringify({ apiKey: 'sl-test-key-123' }), secret)
    const out = JSON.parse(decryptWithWorkerSecret(blob, secret)) as { apiKey: string }
    expect(out.apiKey).toBe('sl-test-key-123')
  })

  it('fails to decrypt with the wrong secret', () => {
    const blob = encryptWithWorkerSecret('secret-data', secret)
    expect(() => decryptWithWorkerSecret(blob, 'x'.repeat(32))).toThrow()
  })
})
