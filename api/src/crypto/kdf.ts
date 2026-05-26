import argon2 from 'argon2'
import crypto from 'node:crypto'

export function generateSalt(): string {
  return crypto.randomBytes(32).toString('hex')
}

export async function deriveKey(password: string, salt: string): Promise<Buffer> {
  const raw = await argon2.hash(password, {
    type:        argon2.argon2id,
    memoryCost:  65536,
    timeCost:    3,
    parallelism: 4,
    salt:        Buffer.from(salt, 'hex'),
    hashLength:  32,
    raw:         true,
  })
  return Buffer.from(raw)
}
