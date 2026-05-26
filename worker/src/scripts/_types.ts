import type { Page } from '@playwright/test'

export interface DecryptedPII {
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

export type OptOutResult =
  | { status: 'submitted' }
  | { status: 'awaiting_email'; confirmationPattern: string }
  | { status: 'confirmed' }
  | { status: 'already_removed' }
  | { status: 'failed'; reason: string }
  | { status: 'manual' }

export interface BrokerScriptContext {
  page:          Page
  pii:           DecryptedPII
  screenshotDir: string
  brokerId:      string
}

export type BrokerScriptFn = (ctx: BrokerScriptContext) => Promise<OptOutResult>
