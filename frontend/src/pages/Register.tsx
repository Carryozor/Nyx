import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { Moon } from 'lucide-react'
import { useAuthStore } from '../store/auth.js'
import { api } from '../api/client.js'

export function Register() {
  const [params]                  = useSearchParams()
  const [email, setEmail]         = useState(params.get('email') ?? '')
  const [password, setPassword]   = useState('')
  const [password2, setPassword2] = useState('')
  const [token]                   = useState(params.get('token') ?? '')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const { login }                 = useAuthStore()
  const navigate                  = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== password2) { setError('Passwords do not match'); return }
    if (password.length < 8)    { setError('Password must be at least 8 characters'); return }

    setError('')
    setLoading(true)
    try {
      await api.register(email, password, token || undefined)
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center">
            <Moon size={20} className="text-white" />
          </div>
          <span className="text-2xl font-bold text-white">Nyx</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <h1 className="text-xl font-semibold text-white mb-2">Create account</h1>
          <p className="text-sm text-slate-400 mb-6">
            {token ? 'You were invited to Nyx.' : 'First user becomes admin.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                required autoFocus />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                required minLength={8} />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Confirm password</label>
              <input type="password" value={password2} onChange={e => setPassword2(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                required />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <p className="text-xs text-slate-500">
              ⚠️ Your password encrypts your personal data — it cannot be recovered if lost.
            </p>
            <button type="submit" disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2 rounded-lg transition disabled:opacity-50">
              {loading ? 'Creating…' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-sm mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-400 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
