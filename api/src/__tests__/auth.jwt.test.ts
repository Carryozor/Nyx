import { describe, it, expect, beforeAll } from 'vitest'

describe('JWT', () => {
  beforeAll(() => {
    process.env.JWT_SECRET    = 'a'.repeat(32)
    process.env.WORKER_SECRET = 'b'.repeat(32)
    process.env.DB_PATH       = ':memory:'
  })

  it('signs and verifies a valid token', async () => {
    const { signToken, verifyToken } = await import('../auth/jwt.js')
    const token = signToken({ id: 'u1', email: 'a@b.com', role: 'admin' })
    const payload = verifyToken(token)
    expect(payload.id).toBe('u1')
    expect(payload.role).toBe('admin')
  })

  it('throws on a tampered token', async () => {
    const { signToken, verifyToken } = await import('../auth/jwt.js')
    const token = signToken({ id: 'u1', email: 'a@b.com', role: 'user' })
    expect(() => verifyToken(token + 'x')).toThrow()
  })
})
