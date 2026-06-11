import { useEffect, useRef, useState } from 'react'
import { Loader2, Mail, Key, AlertTriangle, CheckCircle2, SlidersHorizontal, Globe } from 'lucide-react'
import { api } from '../api/client.js'
import { REGION_CODES, PAN_EU_TAG, countryLabel, type RegionKey } from '../lib/regions.js'
import type { Broker, BrokerAudience } from '../types.js'

const SL_KEY = 'nyx_simplelogin_key'

export interface ScanOptions {
  email?: string
  aliasId?: number | null
  audience: BrokerAudience
  brokerIds?: string[]
  countries?: string[]
}

const REGION_BUTTONS: { key: RegionKey; label: string }[] = [
  { key: 'all',    label: 'Tout' },
  { key: 'ue',     label: 'Union Européenne' },
  { key: 'europe', label: 'Europe' },
  { key: 'us',     label: 'US' },
]

interface Props {
  profileLabel: string
  profileId: string
  defaultRedirectEmail?: string | null
  onConfirm: (password: string, opts: ScanOptions) => Promise<void>
  onCancel: () => void
}

type AliasState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; alias: string; aliasId: number | null }
  | { status: 'error'; message: string }

const AUDIENCES: { value: BrokerAudience; label: string }[] = [
  { value: 'private', label: 'Privé' },
  { value: 'professional', label: 'Professionnel' },
  { value: 'both', label: 'Les deux' },
]

const AUDIENCE_BADGE: Record<BrokerAudience, { dot: string; label: string }> = {
  private:      { dot: 'bg-green-400',  label: 'Privé' },
  professional: { dot: 'bg-blue-400',   label: 'Pro' },
  both:         { dot: 'bg-purple-400', label: 'Les 2' },
}

function AudienceBadge({ audience }: { audience: BrokerAudience }) {
  const b = AUDIENCE_BADGE[audience]
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 shrink-0">
      <span className={`w-1.5 h-1.5 rounded-full ${b.dot}`} />
      {b.label}
    </span>
  )
}

export function ScanModal({ profileLabel, profileId, defaultRedirectEmail, onConfirm, onCancel }: Props) {
  const [password, setPassword]   = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [aliasState, setAliasState]   = useState<AliasState>({ status: 'idle' })
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]         = useState('')
  const [audience, setAudience]   = useState<BrokerAudience>('both')
  const [expertMode, setExpertMode] = useState(false)
  const [brokers, setBrokers]     = useState<Broker[] | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Empty set = no country filter (all countries).
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set())
  const [quota, setQuota] = useState<{ sent_today: number; cap: number; remaining: number } | null>(null)
  const [redirectEmail, setRedirectEmail] = useState(defaultRedirectEmail ?? '')
  const passwordRef = useRef<HTMLInputElement>(null)
  const aliasCreatedRef = useRef<{ aliasId: number } | null>(null)
  const hasSLKey = Boolean(localStorage.getItem(SL_KEY)?.trim())

  useEffect(() => {
    passwordRef.current?.focus()
    if (!hasSLKey) return

    const key = localStorage.getItem(SL_KEY)!.trim()
    setAliasState({ status: 'loading' })
    api.simplelogin.createAlias(key, `nyx opt-out — ${profileLabel}`)
      .then(({ alias, aliasId }) => {
        setAliasState({ status: 'ok', alias, aliasId })
        if (aliasId) aliasCreatedRef.current = { aliasId }
      })
      .catch(err => setAliasState({ status: 'error', message: err instanceof Error ? err.message : String(err) }))
  }, [])

  // Load the broker list on mount — used both for the country selector and expert mode.
  useEffect(() => {
    api.brokers.list()
      .then(rows => {
        const targetable = (rows as Broker[]).filter(b => b.type !== 'manual')
        setBrokers(targetable)
        setSelectedIds(new Set(targetable.map(b => b.id)))
      })
      .catch(() => setBrokers([]))
    api.mailQuota().then(setQuota).catch(() => setQuota(null))
  }, [])

  // Individual countries offered as checkboxes (the pan-EU tag is region-only).
  const availableCountries = brokers
    ? Array.from(new Set(brokers.map(b => b.country).filter(c => c !== PAN_EU_TAG))).sort()
    : []

  const applyRegion = (key: RegionKey) => {
    if (key === 'all') return setSelectedCountries(new Set())
    // Only select region countries that actually exist in the broker set (+ pan-EU tag).
    const present = new Set(brokers?.map(b => b.country) ?? [])
    setSelectedCountries(new Set(REGION_CODES[key].filter(c => present.has(c))))
  }

  const toggleCountry = (code: string) => {
    setSelectedCountries(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  // Whether a region button reflects the current country selection (for highlighting).
  const regionActive = (key: RegionKey): boolean => {
    if (key === 'all') return selectedCountries.size === 0
    const present = REGION_CODES[key].filter(c => brokers?.some(b => b.country === c))
    return selectedCountries.size > 0
      && present.every(c => selectedCountries.has(c))
      && Array.from(selectedCountries).every(c => REGION_CODES[key].includes(c))
  }

  const effectiveEmail =
    aliasState.status === 'ok' ? aliasState.alias :
    manualEmail.trim() || undefined

  const effectiveAliasId =
    aliasState.status === 'ok' ? aliasState.aliasId : null

  const toggleBroker = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCancel = () => {
    const created = aliasCreatedRef.current
    if (created?.aliasId) {
      const key = localStorage.getItem(SL_KEY)?.trim()
      if (key) api.simplelogin.deleteAlias(key, created.aliasId).catch(() => {})
    }
    onCancel()
  }

  const expertSelectionEmpty = expertMode && selectedIds.size === 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || expertSelectionEmpty) return
    setSubmitting(true)
    setError('')
    try {
      // Reply redirection: persist the (possibly edited) delegate address on the profile.
      // The worker sets it as the GDPR email's Reply-To, so brokers reply straight to the
      // delegate's normal inbox — no SimpleLogin account needed on their side.
      const redirect = redirectEmail.trim()
      if (redirect !== (defaultRedirectEmail ?? '')) {
        await api.profiles.setRedirectEmail(profileId, redirect || null).catch(() => {})
      }

      await onConfirm(password, {
        email: effectiveEmail,
        aliasId: effectiveAliasId,
        audience,
        brokerIds: expertMode ? Array.from(selectedIds) : undefined,
        countries: !expertMode && selectedCountries.size ? Array.from(selectedCountries) : undefined,
      })
      aliasCreatedRef.current = null  // submitted — don't clean up
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-white mb-1">
          Scan &ldquo;{profileLabel}&rdquo;
        </h2>
        <p className="text-sm text-slate-400 mb-3">
          Enter your master password to decrypt and start the scan.
        </p>

        {quota && (
          <div className={`mb-4 text-xs px-3 py-1.5 rounded-lg border ${
            quota.remaining === 0 ? 'border-red-800 bg-red-900/20 text-red-300' : 'border-slate-700 text-slate-400'
          }`}>
            Budget email Brevo : <span className="text-slate-200">{quota.remaining}</span> / {quota.cap} restants aujourd'hui
            {quota.remaining === 0 && ' — scan bloqué tant que le quota est épuisé.'}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Password */}
          <div>
            <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1.5">
              <Key size={12} /> Master password
            </label>
            <input
              ref={passwordRef}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Audience selector */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Type de courtiers</label>
            <div className="grid grid-cols-3 gap-1.5">
              {AUDIENCES.map(a => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setAudience(a.value)}
                  disabled={expertMode}
                  className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs transition disabled:opacity-40 ${
                    audience === a.value
                      ? 'border-brand-500 bg-brand-500/10 text-white'
                      : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${AUDIENCE_BADGE[a.value].dot}`} />
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Country / region selector */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
              <Globe size={12} /> Pays ciblés
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {REGION_BUTTONS.map(r => {
                const active = regionActive(r.key)
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => applyRegion(r.key)}
                    disabled={expertMode}
                    className={`px-2.5 py-1 rounded-lg border text-xs transition disabled:opacity-40 ${
                      active ? 'border-brand-500 bg-brand-500/10 text-white' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {r.label}
                  </button>
                )
              })}
            </div>
            {availableCountries.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {availableCountries.map(code => {
                  const checked = selectedCountries.has(code)
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => toggleCountry(code)}
                      disabled={expertMode}
                      title={countryLabel(code)}
                      className={`px-2 py-0.5 rounded-md border text-[11px] transition disabled:opacity-40 ${
                        checked ? 'border-brand-500 bg-brand-500/10 text-white' : 'border-slate-700 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {code}
                    </button>
                  )
                })}
              </div>
            )}
            <p className="text-[11px] text-slate-500 mt-1">
              {selectedCountries.size === 0 ? 'Tous les pays seront contactés.' : `${selectedCountries.size} sélection(s) — les autres pays sont exclus.`}
            </p>
          </div>

          {/* Expert mode */}
          <div>
            <button
              type="button"
              onClick={() => setExpertMode(v => !v)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
            >
              <SlidersHorizontal size={12} />
              {expertMode ? 'Masquer le mode expert' : 'Mode expert : choisir les courtiers'}
            </button>

            {expertMode && (
              <div className="mt-2 border border-slate-700 rounded-lg max-h-48 overflow-y-auto divide-y divide-slate-800">
                {brokers === null && (
                  <div className="flex items-center gap-2 px-3 py-3 text-xs text-slate-400">
                    <Loader2 size={14} className="animate-spin" /> Chargement des courtiers…
                  </div>
                )}
                {brokers?.map(b => (
                  <label key={b.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-800">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(b.id)}
                      onChange={() => toggleBroker(b.id)}
                      className="accent-brand-500"
                    />
                    <span className="flex-1 text-slate-200 truncate">{b.name}</span>
                    <AudienceBadge audience={b.audience} />
                  </label>
                ))}
              </div>
            )}
            {expertSelectionEmpty && (
              <p className="text-orange-400 text-xs mt-1">Sélectionne au moins un courtier.</p>
            )}
          </div>

          {/* Confirmation email */}
          <div>
            <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1.5">
              <Mail size={12} /> Confirmation email
            </label>

            {hasSLKey ? (
              <div className="rounded-lg border border-slate-700 px-3 py-2 text-sm min-h-[38px] flex items-center gap-2">
                {aliasState.status === 'loading' && (
                  <>
                    <Loader2 size={14} className="animate-spin text-slate-400" />
                    <span className="text-slate-400">Creating SimpleLogin alias…</span>
                  </>
                )}
                {aliasState.status === 'ok' && (
                  <>
                    <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                    <span className="text-green-300 font-mono text-xs break-all">{aliasState.alias}</span>
                  </>
                )}
                {aliasState.status === 'error' && (
                  <>
                    <AlertTriangle size={14} className="text-orange-400 shrink-0" />
                    <span className="text-orange-300 text-xs">{aliasState.message}</span>
                  </>
                )}
              </div>
            ) : (
              <input
                type="email"
                value={manualEmail}
                onChange={e => setManualEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            )}

            <p className="text-xs text-slate-500 mt-1">
              {hasSLKey
                ? 'Opt-out confirmations will arrive at this alias.'
                : 'Used to receive opt-out confirmation emails. Configure SimpleLogin in Settings for auto-aliases.'}
            </p>
          </div>

          {/* Reply redirect (delegate) */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Rediriger les réponses vers (optionnel)</label>
            <input
              type="email"
              value={redirectEmail}
              onChange={e => setRedirectEmail(e.target.value)}
              placeholder="delegue@autre.fr"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Les réponses des courtiers sont envoyées directement à cette adresse (Reply-To) — aucun
              compte SimpleLogin requis pour le délégué. Vide = les réponses arrivent sur ton alias habituel.
            </p>
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 px-4 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-800 transition text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !password || aliasState.status === 'loading' || expertSelectionEmpty}
              className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              {submitting ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Start scan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
