import crypto from 'node:crypto'
import type { EncryptedBlob } from '../types.js'

/** Derive a 256-bit AES key from workerSecret using HKDF-SHA256 and a per-blob random salt. */
function deriveWorkerKey(workerSecret: string, saltHex: string): Buffer {
  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      Buffer.from(workerSecret),
      Buffer.from(saltHex, 'hex'),
      Buffer.alloc(0),
      32,
    )
  )
}

/**
 * Encrypt the PII key for the worker.
 * Uses HKDF-SHA256 with a fresh random 32-byte salt per call.
 * The derived key is used for AES-256-GCM encryption.
 */
export function encryptJobKey(piiKey: Buffer, workerSecret: string): EncryptedBlob {
  const salt = crypto.randomBytes(32).toString('hex')
  const key  = deriveWorkerKey(workerSecret, salt)
  return encrypt(piiKey.toString('hex'), key, salt)
}

const ALGORITHM = 'aes-256-gcm'

export function encrypt(plaintext: string, key: Buffer, salt: string): EncryptedBlob {
  const iv     = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])

  return {
    salt,
    iv:         iv.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
    authTag:    cipher.getAuthTag().toString('hex'),
  }
}

export function decrypt(blob: EncryptedBlob, key: Buffer): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(blob.iv, 'hex'),
  )
  decipher.setAuthTag(Buffer.from(blob.authTag, 'hex'))

  return Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, 'hex')),
    decipher.final(),
  ]).toString('utf8')
}
