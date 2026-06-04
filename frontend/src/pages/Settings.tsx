import { useEffect, useState } from 'react'
import { Copy, Check, UserPlus, Key, Loader2, CheckCircle2, XCircle, Trash2, Eye, EyeOff } from 'lucide-react'
import { api } from '../api/client.js'
import type { Invitation } from '../types.js'

const SL_KEY          = 'nyx_simplelogin_key'
const SL_AUTOPURGE    = 'nyx_sl_autopurge'

type SlTestState  = 'idle' | 'loading' | 'ok' | 'error'
type PurgeState   = 'idle' | 'listing' | 'purging' | 'done' | 'error'

interface AutoPurgeSetting { enabled: boolean; days: number; autoDeleteWhenDone?: boolean }

function loadAutoPurge(): Partial<AutoPurgeSetting> {
  try { return JSON.parse(localStorage.getItem(SL_AUTOPURGE) ?? '{}') as Partial<AutoPurgeSetting> }
  catch { return {} }
}

export function Settings() {
  const [email, setEmail]             = useState('')
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [slKey, setSlKey]             = useState(() => localStorage.getItem(SL_KEY) ?? '')
  const [slKeyVisible, setSlKeyVisible] = useState(false)
  const [slSaved, setSlSaved]         = useState(false)
  const [slTest, setSlTest]           = useState<SlTestState>('idle')
  const [slTestMsg, setSlTestMsg]     = useState('')
  const [creating, setCreating]       = useState(false)
  const [newToken, setNewToken]       = useState('')
  const [copied, setCopied]           = useState(false)
  const [error, setError]             = useState('')

  const [purgeState, setPurgeState]   = useState<PurgeState>('idle')
  const [purgeMsg, setPurgeMsg]       = useState('')
  const [autoPurge, setAutoPurge]     = useState<AutoPurgeSetting>(() => {
    const saved = loadAutoPurge()
    return {
      enabled: saved.enabled ?? false,
      days:    saved.days    ?? 30,
      autoDeleteWhenDone: saved.autoDeleteWhenDone ?? false,
    }
  })

  const loadInvitations = () => {
    api.invitations.list().then(data => setInvitations(data as Invitation[])).catch(() => {})
  }

  useEffect(() => { loadInvitations() }, [])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError('')
    try {
      const inv = await api.invitations.create(email) as { token: string; email: string }
      const link = `${window.location.origin}/register?token=${inv.token}&email=${encodeURIComponent(email)}`
      setNewToken(link)
      setEmail('')
      loadInvitations()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invitation')
    } finally {
      setCreating(false)
    }
  }

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const saveSlKey = () => {
    localStorage.setItem(SL_KEY, slKey.trim())
    setSlSaved(true)
    setSlTest('idle')
    setTimeout(() => setSlSaved(false), 2000)
  }

  const saveAutoPurge = (next: AutoPurgeSetting) => {
    setAutoPurge(next)
    localStorage.setItem(SL_AUTOPURGE, JSON.stringify(next))
  }

  const purgeNyxAliases = async () => {
    const key = slKey.trim() || localStorage.getItem(SL_KEY)?.trim()
    if (!key) return
    setPurgeState('listing')
    setPurgeMsg('')
    try {
      const { aliases } = await api.simplelogin.listNyxAliases(key)
      if (aliases.length === 0) { setPurgeState('done'); setPurgeMsg('No nyx aliases found.'); return }
      setPurgeState('purging')
      const { deleted } = await api.simplelogin.purgeAliases(key, aliases.map(a => a.id))
      setPurgeState('done')
      setPurgeMsg(`Deleted ${deleted} of ${aliases.length} alias${aliases.length > 1 ? 'es' : ''}.`)
    } catch (err) {
      setPurgeState('error')
      setPurgeMsg(err instanceof Error ? err.message : 'Purge failed')
    }
  }

  const testSlKey = async () => {
    const key = slKey.trim()
    if (!key) return
    setSlTest('loading')
    setSlTestMsg('')
    try {
      const res = await fetch('/simplelogin/alias', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key, note: 'nyx api key test' }),
      })
      const data = await res.json() as { alias?: string; aliasId?: number | null; error?: string }
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)

      // Delete the test alias immediately to avoid accumulating orphaned aliases
      if (data.aliasId) {
        await api.simplelogin.deleteAlias(key, data.aliasId).catch(() => {})
      }

      setSlTest('ok')
      setSlTestMsg(data.alias ? `Key valid (test alias created and deleted)` : 'Key valid')
    } catch (err) {
      setSlTest('error')
      setSlTestMsg(err instanceof Error ? err.message : 'Test failed')
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>

      {/* SimpleLogin */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
        <h2 className="font-semibold text-white mb-1 flex items-center gap-2">
          <Key size={18} />
          SimpleLogin API key
        </h2>
        <p className="text-sm text-slate-400 mb-4">
          Used to automatically create opt-out email aliases and check confirmation emails.
          Get your key at <a href="https://app.simplelogin.io/dashboard/api-key" target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline">simplelogin.io</a>.
        </p>
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <input
              type={slKeyVisible ? 'text' : 'password'}
              value={slKey}
              onChange={e => { setSlKey(e.target.value); setSlTest('idle') }}
              placeholder="SL-…"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 pr-9 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="button"
              onClick={() => setSlKeyVisible(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
              tabIndex={-1}
            >
              {slKeyVisible ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <button
            onClick={testSlKey}
            disabled={!slKey.trim() || slTest === 'loading'}
            className="px-3 py-2 border border-slate-600 text-slate-300 hover:bg-slate-800 rounded-lg text-sm transition disabled:opacity-40"
          >
            {slTest === 'loading' ? <Loader2 size={14} className="animate-spin" /> : 'Test'}
          </button>
          <button onClick={saveSlKey}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition">
            {slSaved ? <Check size={16} className="text-green-300" /> : 'Save'}
          </button>
        </div>

        {slTest === 'ok' && (
          <div className="mt-2 flex items-start gap-2 text-green-400 text-xs">
            <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
            <span>{slTestMsg}</span>
          </div>
        )}
        {slTest === 'error' && (
          <div className="mt-2 flex items-start gap-2 text-red-400 text-xs">
            <XCircle size={13} className="mt-0.5 shrink-0" />
            <span>{slTestMsg}</span>
          </div>
        )}

        <p className="text-xs text-slate-500 mt-2">
          Stored in browser localStorage only — the key is never stored on the server.
        </p>
      </div>

      {/* SimpleLogin alias management */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
        <h2 className="font-semibold text-white mb-1 flex items-center gap-2">
          <Trash2 size={18} />
          SimpleLogin alias cleanup
        </h2>
        <p className="text-sm text-slate-400 mb-4">
          Remove all <span className="font-mono text-slate-300">nyx opt-out</span> aliases created by previous scans.
        </p>

        {/* Manual purge */}
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={purgeNyxAliases}
            disabled={(!slKey.trim() && !localStorage.getItem(SL_KEY)) || purgeState === 'listing' || purgeState === 'purging'}
            className="flex items-center gap-2 px-4 py-2 bg-red-900/30 hover:bg-red-900/50 border border-red-800 text-red-300 rounded-lg text-sm transition disabled:opacity-40"
          >
            {purgeState === 'listing' || purgeState === 'purging'
              ? <Loader2 size={14} className="animate-spin" />
              : <Trash2 size={14} />}
            {purgeState === 'listing' ? 'Listing aliases…' : purgeState === 'purging' ? 'Deleting…' : 'Purge all nyx aliases'}
          </button>
          {purgeState === 'done' && <span className="text-xs text-green-400">{purgeMsg}</span>}
          {purgeState === 'error' && <span className="text-xs text-red-400">{purgeMsg}</span>}
        </div>

        {/* Auto-purge */}
        <div className="border border-slate-700 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-300 font-medium">Auto-purge after scan</p>
              <p className="text-xs text-slate-500">Automatically delete the alias N days after a scan completes.</p>
            </div>
            <button
              onClick={() => saveAutoPurge({ ...autoPurge, enabled: !autoPurge.enabled })}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoPurge.enabled ? 'bg-brand-600' : 'bg-slate-700'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${autoPurge.enabled ? 'translate-x-4' : 'translate-x-1'}`} />
            </button>
          </div>

          {autoPurge.enabled && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Delete after</span>
              <input
                type="number"
                min={1}
                max={365}
                value={autoPurge.days}
                onChange={e => saveAutoPurge({ ...autoPurge, days: Math.max(1, parseInt(e.target.value) || 30) })}
                className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <span className="text-xs text-slate-400">days</span>
            </div>
          )}
        </div>

        {/* Auto-delete when all done */}
        <div className="border border-slate-700 rounded-lg p-4 mt-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-300 font-medium">Auto-delete when all brokers respond</p>
              <p className="text-xs text-slate-500">Delete alias once every broker has a final status (no more awaiting emails).</p>
            </div>
            <button
              onClick={() => saveAutoPurge({ ...autoPurge, autoDeleteWhenDone: !autoPurge.autoDeleteWhenDone })}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoPurge.autoDeleteWhenDone ? 'bg-brand-600' : 'bg-slate-700'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${autoPurge.autoDeleteWhenDone ? 'translate-x-4' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
        <h2 className="font-semibold text-white mb-1 flex items-center gap-2">
          <UserPlus size={18} />
          Invite user
        </h2>
        <p className="text-sm text-slate-400 mb-4">Creates a 48h invitation link for a new user account.</p>

        <form onSubmit={handleInvite} className="flex gap-3">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            required />
          <button type="submit" disabled={creating}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50">
            {creating ? 'Creating…' : 'Invite'}
          </button>
        </form>

        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}

        {newToken && (
          <div className="mt-4 p-3 bg-slate-800 rounded-lg">
            <p className="text-xs text-slate-400 mb-2">Share this link (expires in 48h):</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs text-brand-300 truncate">{newToken}</code>
              <button onClick={() => copy(newToken)} className="text-slate-400 hover:text-white transition">
                {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="font-semibold text-white mb-4">Pending invitations</h2>
        {invitations.length === 0 ? (
          <p className="text-slate-400 text-sm">No invitations yet.</p>
        ) : (
          <div className="space-y-2">
            {invitations.map(inv => (
              <div key={inv.token} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                <div>
                  <p className="text-sm text-white">{inv.email}</p>
                  <p className="text-xs text-slate-500">
                    Expires {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${inv.used_at ? 'bg-green-900 text-green-300' : 'bg-slate-700 text-slate-400'}`}>
                  {inv.used_at ? 'used' : 'pending'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
