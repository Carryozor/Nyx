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

export function decryptJobKey(encryptedJobKey: string, workerSecret: string): Buffer {
  const blob: EncryptedBlob = JSON.parse(encryptedJobKey)
  const workerKeyBuf = Buffer.from(workerSecret.padEnd(32, '0').slice(0, 32))
  const hexKey = decrypt(blob, workerKeyBuf)
  return Buffer.from(hexKey, 'hex')
}
