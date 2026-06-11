import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { ROLE_RANK, hasRank, canAccessProfile, isOwnerOrAdmin } from '../auth/access.js'
import type { AuthUser } from '../types.js'

const user = (id: string, role: AuthUser['role']): AuthUser => ({ id, email: `${id}@x.io`, role })

describe('role ranks', () => {
  it('orders viewer < editor < manager < admin', () => {
    expect(ROLE_RANK.viewer).toBeLessThan(ROLE_RANK.editor)
    expect(ROLE_RANK.editor).toBeLessThan(ROLE_RANK.manager)
    expect(ROLE_RANK.manager).toBeLessThan(ROLE_RANK.admin)
  })

  it('hasRank is inclusive of the threshold and grants higher ranks', () => {
    expect(hasRank(user('a', 'manager'), 'manager')).toBe(true)
    expect(hasRank(user('a', 'admin'), 'manager')).toBe(true)
    expect(hasRank(user('a', 'editor'), 'manager')).toBe(false)
    expect(hasRank(user('a', 'viewer'), 'editor')).toBe(false)
  })
})

describe('profile access', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE profiles (id TEXT PRIMARY KEY, user_id TEXT, label TEXT, encrypted_pii TEXT, created_at TEXT);
      CREATE TABLE profile_access (id TEXT PRIMARY KEY, profile_id TEXT, user_id TEXT, granted_by TEXT, created_at TEXT, UNIQUE(profile_id,user_id));
      INSERT INTO profiles VALUES ('p1','owner','Owned','{}','2026-01-01');
      INSERT INTO profile_access VALUES ('a1','p1','viewer-u','owner','2026-01-01');
    `)
  })
  afterEach(() => db.close())

  it('admin can access any profile', () => {
    expect(canAccessProfile(db, user('someone', 'admin'), 'p1')).toBe(true)
    expect(canAccessProfile(db, user('someone', 'admin'), 'nonexistent')).toBe(true)
  })

  it('owner can access their own profile', () => {
    expect(canAccessProfile(db, user('owner', 'manager'), 'p1')).toBe(true)
  })

  it('a shared user can access the shared profile', () => {
    expect(canAccessProfile(db, user('viewer-u', 'viewer'), 'p1')).toBe(true)
  })

  it('an unrelated user cannot access a non-shared profile', () => {
    expect(canAccessProfile(db, user('stranger', 'manager'), 'p1')).toBe(false)
  })

  it('isOwnerOrAdmin is true for owner and admin only, not a shared viewer', () => {
    expect(isOwnerOrAdmin(db, user('owner', 'manager'), 'p1')).toBe(true)
    expect(isOwnerOrAdmin(db, user('x', 'admin'), 'p1')).toBe(true)
    expect(isOwnerOrAdmin(db, user('viewer-u', 'viewer'), 'p1')).toBe(false)
  })
})
