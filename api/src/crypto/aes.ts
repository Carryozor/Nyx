import crypto from 'node:crypto'
import type { EncryptedBlob } from '../types.js'

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
