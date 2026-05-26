import { useState } from 'react'
import { Lock } from 'lucide-react'

interface Props {
  title:     string
  onConfirm: (password: string) => Promise<void>
  onCancel:  () => void
}

export function PasswordModal({ title, onConfirm, onCancel }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onConfirm(password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wrong password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <Lock className="text-brand-500" size={20} />
          <h2 className="text-lg font-semibold text-white">{title}</h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Master password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              autoFocus
              required
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onCancel}
              className="flex-1 px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 transition">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium transition disabled:opacity-50">
              {loading ? 'Verifying…' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
