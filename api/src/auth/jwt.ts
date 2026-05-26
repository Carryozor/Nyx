import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import type { AuthUser } from '../types.js'

const EXPIRY = '8h'

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    config.JWT_SECRET,
    { expiresIn: EXPIRY },
  )
}

export function verifyToken(token: string): AuthUser {
  const payload = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload & AuthUser
  return { id: payload.id, email: payload.email, role: payload.role }
}
