import type { Role } from '../types.js'

/** Hierarchical role ranks — mirror of the API's auth/access.ts. */
export const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  editor: 1,
  manager: 2,
  admin: 3,
}

/** True when `role` is at least `min`. */
export function hasRank(role: Role | undefined | null, min: Role): boolean {
  if (!role) return false
  return ROLE_RANK[role] >= ROLE_RANK[min]
}
