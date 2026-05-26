import { useEffect, useState } from 'react'
import { Copy, Check, UserPlus } from 'lucide-react'
import { api } from '../api/client.js'
import type { Invitation } from '../types.js'

export function Settings() {
  const [email, setEmail]             = useState('')
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [creating, setCreating]       = useState(false)
  const [newToken, setNewToken]       = useState('')
  const [copied, setCopied]           = useState(false)
  const [error, setError]             = useState('')

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

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>

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
