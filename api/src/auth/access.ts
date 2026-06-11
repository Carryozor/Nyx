import type { FastifyReply } from 'fastify'
import type Database from 'better-sqlite3'
import type { AuthUser, Role } from '../types.js'

/** Hierarchical role ranks: a higher rank inherits every lower rank's rights. */
export const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  editor: 1,
  manager: 2,
  admin: 3,
}

/** True when the user's role is at least `min`. */
export function hasRank(user: AuthUser, min: Role): boolean {
  return ROLE_RANK[user.role] >= ROLE_RANK[min]
}

/** Owner of the profile, or admin. (Edit/delete/share gate.) */
export function isOwnerOrAdmin(db: Database.Database, user: AuthUser, profileId: string): boolean {
  if (user.role === 'admin') return true
  const row = db.prepare('SELECT user_id FROM profiles WHERE id = ?').get(profileId) as { user_id: string } | undefined
  return row?.user_id === user.id
}

/** Admin, owner, or a user the profile has been explicitly shared with. */
export function canAccessProfile(db: Database.Database, user: AuthUser, profileId: string): boolean {
  if (isOwnerOrAdmin(db, user, profileId)) return true
  const share = db.prepare('SELECT 1 FROM profile_access WHERE profile_id = ? AND user_id = ?').get(profileId, user.id)
  return Boolean(share)
}

/**
 * Guard a profile READ (viewer+ with access). Returns true when allowed; otherwise
 * sends the appropriate 403/404 on `reply` and returns false.
 */
export function requireProfileRead(db: Database.Database, user: AuthUser, profileId: string, reply: FastifyReply): boolean {
  if (canAccessProfile(db, user, profileId)) return true
  reply.code(403).send({ error: 'Forbidden' })
  return false
}

/**
 * Guard a profile ACTION such as launching a scan or managing a schedule:
 * requires access AND editor+ rank (owners are managers, which is ≥ editor).
 */
export function requireProfileAction(db: Database.Database, user: AuthUser, profileId: string, reply: FastifyReply): boolean {
  if (canAccessProfile(db, user, profileId) && hasRank(user, 'editor')) return true
  reply.code(403).send({ error: 'Forbidden' })
  return false
}

/** Guard an owner/admin-only operation (edit, delete, share). */
export function requireOwnerOrAdmin(db: Database.Database, user: AuthUser, profileId: string, reply: FastifyReply): boolean {
  if (isOwnerOrAdmin(db, user, profileId)) return true
  reply.code(403).send({ error: 'Forbidden' })
  return false
}
