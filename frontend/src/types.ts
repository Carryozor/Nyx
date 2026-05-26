export interface User {
  id: string
  email: string
  role: 'admin' | 'user'
}

export interface Profile {
  id: string
  user_id: string
  label: string
  created_at: string
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
}

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
  created_at: string
  started_at: string | null
  finished_at: string | null
  stats?: ScanJobStats | null
}

export interface Invitation {
  token: string
  email: string
  expires_at: string
  used_at: string | null
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
  | { type: 'broker_done'; jobId: string; payload: { broker: string; status: string } }
  | { type: 'complete'; jobId: string; payload: { jobId: string; brokerCount: number } }
  | { type: 'auth:ok'; userId: string }
  | { type: 'auth:error'; error: string }
