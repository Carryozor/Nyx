import type { Page } from '@playwright/test'
import type Database from 'better-sqlite3'

export interface CompanyInfo {
  name: string
  siren?: string
  siret?: string
  legalForm?: string
}

export interface DecryptedPII {
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

export type OptOutResult =
  | { status: 'submitted' }
  | { status: 'awaiting_email'; confirmationPattern: string }
  | { status: 'confirmed' }
  | { status: 'already_removed' }
  | { status: 'failed'; reason: string }
  | { status: 'manual'; reason?: string }

export interface BrokerScriptContext {
  page:          Page
  pii:           DecryptedPII
  screenshotDir: string
  brokerId:      string
  profileId:     string
  db:            Database.Database
}

export type BrokerScriptFn = (ctx: BrokerScriptContext) => Promise<OptOutResult>
