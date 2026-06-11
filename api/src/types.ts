export interface EncryptedBlob {
  salt: string
  iv: string
  ciphertext: string
  authTag: string
}

export interface CompanyInfo {
  name: string
  siren?: string
  siret?: string
  legalForm?: string
}

export interface ProfilePII {
  firstName: string
  lastName: string
  dob: string
  email?: string
  phone?: string
  aliases?: string[]
  currentAddress: Address
  previousAddresses?: Address[]
  company?: CompanyInfo
}

export interface Address {
  street: string
  city: string
  state?: string
  zip?: string
  country: string
}

export interface UserRow {
  id: string
  email: string
  password_hash: string
  role: string
  created_at: string
  invited_by: string | null
}

export interface ProfileRow {
  id: string
  user_id: string
  label: string
  encrypted_pii: string
  created_at: string
  redirect_email: string | null
  owner_email?: string
}

export interface BrokerRow {
  id: string
  name: string
  url: string
  country: string
  type: string
  script_file: string | null
  manual_guide: string | null
  active: number
  audience: 'private' | 'professional' | 'both'
  opt_out_email: string | null
  gdpr_lang: string | null
}

export interface ScanJobRow {
  id: string
  profile_id: string
  broker_ids: string | null
  status: string
  encrypted_job_key: string
  confirmation_email: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
  created_by: string
}

export interface OptOutRequestRow {
  id: string
  profile_id: string
  broker_id: string
  status: string
  submitted_at: string | null
  confirmed_at: string | null
  last_attempt: string | null
  attempts: number
  screenshot: string | null
  notes: string | null
}

export interface EmailConfigRow {
  id: string
  profile_id: string
  provider: string
  encrypted_credentials: string
}

export interface InvitationRow {
  token: string
  email: string
  created_by: string
  expires_at: string
  used_at: string | null
  role: string
}

export interface ScanScheduleRow {
  id: string
  profile_id: string
  interval_days: number
  next_run: string
  last_run: string | null
  enabled: number
  encrypted_schedule_key: string
}

export interface ScanEventRow {
  id: string
  job_id: string
  event_type: string
  payload: string
  created_at: string
  broadcast: number
}

export type Role = 'admin' | 'manager' | 'editor' | 'viewer'

export interface AuthUser {
  id: string
  email: string
  role: Role
}

export interface ProfileAccessRow {
  id: string
  profile_id: string
  user_id: string
  granted_by: string | null
  created_at: string
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser
  }
}
