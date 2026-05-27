import { useEffect, useRef, useState } from 'react'
import { Loader2, Mail, Key, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { api } from '../api/client.js'

const SL_KEY = 'nyx_simplelogin_key'

interface Props {
  profileLabel: string
  onConfirm: (password: string, email?: string, aliasId?: number | null) => Promise<void>
  onCancel: () => void
}

type AliasState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; alias: string; aliasId: number | null }
  | { status: 'error'; message: string }

export function ScanModal({ profileLabel, onConfirm, onCancel }: Props) {
  const [password, setPassword]   = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [aliasState, setAliasState]   = useState<AliasState>({ status: 'idle' })
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]         = useState('')
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

  const effectiveEmail =
    aliasState.status === 'ok' ? aliasState.alias :
    manualEmail.trim() || undefined

  const effectiveAliasId =
    aliasState.status === 'ok' ? aliasState.aliasId : null

  const handleCancel = () => {
    const created = aliasCreatedRef.current
    if (created?.aliasId) {
      const key = localStorage.getItem(SL_KEY)?.trim()
      if (key) api.simplelogin.deleteAlias(key, created.aliasId).catch(() => {})
    }
    onCancel()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    setSubmitting(true)
    setError('')
    try {
      await onConfirm(password, effectiveEmail, effectiveAliasId)
      aliasCreatedRef.current = null  // submitted — don't clean up
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-1">
          Scan &ldquo;{profileLabel}&rdquo;
        </h2>
        <p className="text-sm text-slate-400 mb-5">
          Enter your master password to decrypt and start the scan.
        </p>

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
              disabled={submitting || !password || aliasState.status === 'loading'}
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
