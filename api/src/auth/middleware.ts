import type { FastifyRequest, FastifyReply } from 'fastify'
import { verifyToken } from './jwt.js'
import { hasRank } from './access.js'
import type { Role } from '../types.js'

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = req.cookies['nyx_session']
  if (!token) {
    return reply.code(401).send({ error: 'Unauthorized' })
  }
  try {
    req.user = verifyToken(token)
  } catch {
    return reply.code(401).send({ error: 'Invalid session' })
  }
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(req, reply)
  if (reply.sent) return
  if (req.user.role !== 'admin') {
    return reply.code(403).send({ error: 'Admin only' })
  }
}

/** Middleware factory: require the authenticated user to hold at least `min` rank. */
export function requireRole(min: Role) {
  return async function (req: FastifyRequest, reply: FastifyReply): Promise<void> {
    await requireAuth(req, reply)
    if (reply.sent) return
    if (!hasRank(req.user, min)) {
      return reply.code(403).send({ error: 'Insufficient role' })
    }
  }
}
