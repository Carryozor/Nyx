import { useEffect, useState } from 'react'
import { Share2, Trash2, Loader2, UserPlus } from 'lucide-react'
import { api } from '../api/client.js'
import type { ProfileShare } from '../types.js'

interface Props {
  profileId: string
}

/**
 * Profile sharing panel (owner/admin). Lists who a profile is shared with and lets
 * the owner add a viewer/editor by email or revoke access. Targets must already exist
 * (created via invitation) and be viewer/editor — the API enforces both.
 */
export function ProfileShares({ profileId }: Props) {
  const [shares, setShares]   = useState<ProfileShare[]>([])
  const [email, setEmail]     = useState('')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')

  const load = () => {
    api.shares.list(profileId).then(setShares).catch(() => setShares([]))
  }
  useEffect(() => { load() }, [profileId])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    setError('')
    try {
      await api.shares.add(profileId, email.trim())
      setEmail('')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (userId: string) => {
    await api.shares.remove(profileId, userId).catch(() => {})
    load()
  }

  const badge = (role: string) =>
    role === 'editor'
      ? 'bg-blue-900/40 text-blue-300'
      : 'bg-slate-700 text-slate-300'

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-3">
        <Share2 size={14} /> Partage du profil
      </h2>

      <form onSubmit={handleAdd} className="flex gap-2 mb-3">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="email d'un utilisateur viewer / editor"
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="flex items-center gap-1.5 px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm transition disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
          Partager
        </button>
      </form>

      {error && <p className="text-red-400 text-xs mb-2">{error}</p>}

      {shares.length === 0 ? (
        <p className="text-sm text-slate-500">Ce profil n'est partagé avec personne.</p>
      ) : (
        <ul className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden">
          {shares.map(s => (
            <li key={s.user_id} className="flex items-center justify-between px-3 py-2 bg-slate-900">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-slate-200 truncate">{s.email}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${badge(s.role)}`}>{s.role}</span>
              </div>
              <button
                onClick={() => handleRemove(s.user_id)}
                className="text-slate-500 hover:text-red-400 transition"
                title="Révoquer l'accès"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
