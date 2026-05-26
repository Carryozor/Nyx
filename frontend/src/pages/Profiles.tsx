import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, ChevronRight } from 'lucide-react'
import { api } from '../api/client.js'
import type { Profile } from '../types.js'

export function Profiles() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading]   = useState(true)

  const load = () => {
    api.profiles.list().then(data => {
      setProfiles(data as Profile[])
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Delete profile "${label}"? This also deletes all opt-out history.`)) return
    await api.profiles.delete(id)
    load()
  }

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Profiles</h1>
        <Link to="/profiles/new"
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm transition">
          <Plus size={16} />
          New profile
        </Link>
      </div>

      {profiles.length === 0 ? (
        <div className="bg-slate-900 border border-dashed border-slate-700 rounded-xl p-12 text-center">
          <p className="text-slate-400">No profiles. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map(p => (
            <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between">
              <div>
                <h3 className="font-medium text-white">{p.label}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Created {new Date(p.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => handleDelete(p.id, p.label)}
                  className="text-slate-500 hover:text-red-400 transition">
                  <Trash2 size={16} />
                </button>
                <Link to={`/profiles/${p.id}`} className="text-slate-400 hover:text-white transition">
                  <ChevronRight size={18} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
