export type Role = 'admin' | 'manager' | 'editor' | 'viewer'

export interface User {
  id: string
  email: string
  role: Role
}

export interface ProfileShare {
  user_id: string
  email: string
  role: Role
  created_at: string
}

export interface Profile {
  id: string
  user_id: string
  label: string
  created_at: string
  redirect_email?: string | null
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

export type BrokerAudience = 'private' | 'professional' | 'both'

export interface Address {
  street: string
  city: string
  state?: string
  zip?: string
  country: string
}

export interface Broker {
  id: string
  name: string
  url: string
  country: string
  type: 'auto' | 'semi' | 'manual'
  script_file: string | null
  manual_guide: string | null
  active: number
  audience: BrokerAudience
}

export interface OptOutRequest {
  id: string
  profile_id: string
  broker_id: string
  status: 'pending' | 'submitted' | 'awaiting_email' | 'confirmed' | 'failed' | 'manual' | 'already_removed'
  submitted_at: string | null
  confirmed_at: string | null
  last_attempt: string | null
  attempts: number
  notes: string | null
  screenshot: string | null
  confirmation_pattern: string | null
  manual_guide: string | null
  broker_name?: string
  broker_type?: string
  broker_url?: string
}

export interface ScanJobStats {
  total:         number
  failed:        number
  confirmed:     number
  awaiting_email: number
  submitted:     number
}

export interface ScanJob {
  id: string
  profile_id: string
  status: 'queued' | 'running' | 'done' | 'failed'
  broker_count?: number
  confirmation_email?: string | null
  simplelogin_alias_id?: number | null
  profile_label?: string
  created_at: string
  started_at: string | null
  finished_at: string | null
  stats?: ScanJobStats | null
  opt_outs?: OptOutRequest[]
}

export interface Invitation {
  token: string
  email: string
  expires_at: string
  used_at: string | null
  role?: Role
}

export interface ScanSchedule {
  id: string
  profile_id: string
  interval_days: number
  next_run: string
  last_run: string | null
  enabled: boolean
}

export type ScanEventPayload =
  | { type: 'progress'; jobId: string; payload: { broker: string; attempt: number; phase: string } }
  | { type: 'broker_done'; jobId: string; payload: { broker: string; status: string; notes?: string | null } }
  | { type: 'complete'; jobId: string; payload: { jobId: string; brokerCount: number } }
  | { type: 'auth:ok'; userId: string }
  | { type: 'auth:error'; error: string }
