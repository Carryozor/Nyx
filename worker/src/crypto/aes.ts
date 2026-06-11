import crypto from 'node:crypto'

export interface EncryptedBlob {
  salt: string
  iv: string
  ciphertext: string
  authTag: string
}

export function decrypt(blob: EncryptedBlob, key: Buffer): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'hex'))
  decipher.setAuthTag(Buffer.from(blob.authTag, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, 'hex')),
    decipher.final(),
  ]).toString('utf8')
}

export function encrypt(plaintext: string, key: Buffer, salt: string): EncryptedBlob {
  const iv     = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return {
    salt,
    iv:         iv.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
    authTag:    cipher.getAuthTag().toString('hex'),
  }
}

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

export function decryptJobKey(encryptedJobKey: string, workerSecret: string): Buffer {
  const blob: EncryptedBlob = JSON.parse(encryptedJobKey)
  const key = deriveWorkerKey(workerSecret, blob.salt)
  const hexKey = decrypt(blob, key)
  return Buffer.from(hexKey, 'hex')
}

/**
 * Decrypt data that was encrypted with encryptWithWorkerSecret (api side):
 * background-service credentials the worker reads continuously, independent of
 * any scan job key (which is purged after each scan).
 */
export function decryptWithWorkerSecret(blob: EncryptedBlob, workerSecret: string): string {
  const key = deriveWorkerKey(workerSecret, blob.salt)
  return decrypt(blob, key)
}
