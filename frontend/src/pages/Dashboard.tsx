import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, AlertTriangle, Play, ChevronRight } from 'lucide-react'
import { useAuthStore } from '../store/auth.js'
import { api } from '../api/client.js'
import { StatusBadge } from '../components/StatusBadge.js'
import { ScanModal, type ScanOptions } from '../components/ScanModal.js'
import type { Profile, OptOutRequest, ScanJob } from '../types.js'

interface ProfileStats {
  profile: Profile
  optOuts: OptOutRequest[]
}

export function Dashboard() {
  const { user }              = useAuthStore()
  const [stats, setStats]     = useState<ProfileStats[]>([])
  const [jobs, setJobs]       = useState<ScanJob[]>([])
  const [loading, setLoading] = useState(true)
  const [scanProfile, setScanProfile] = useState<Profile | null>(null)

  useEffect(() => {
    Promise.all([api.profiles.list(), api.scans.list()]).then(async ([profiles, scans]) => {
      const ps = profiles as Profile[]
      const statsArr = await Promise.all(
        ps.map(async p => ({
          profile: p,
          optOuts: (await api.optOuts.forProfile(p.id).catch(() => [])) as OptOutRequest[],
        }))
      )
      setStats(statsArr)
      setJobs(scans as ScanJob[])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const totalConfirmed = stats.flatMap(s => s.optOuts).filter(o => o.status === 'confirmed').length
  const totalPending   = stats.flatMap(s => s.optOuts).filter(o => o.status === 'awaiting_email').length
  const totalManual    = stats.flatMap(s => s.optOuts).filter(o => o.status === 'manual').length
  const activeJob      = jobs.find(j => j.status === 'running' || j.status === 'queued')

  const handleScan = async (password: string, opts: ScanOptions) => {
    if (!scanProfile) return
    await api.scans.create(scanProfile.id, password, opts.email, opts.aliasId, opts.audience, opts.brokerIds)
    setScanProfile(null)
    const updated = await api.scans.list() as ScanJob[]
    setJobs(updated)
  }

  if (loading) {
    return <div className="p-8 text-slate-400">Loading…</div>
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            {user?.role === 'admin' ? 'All profiles overview' : 'Your privacy status'}
          </p>
        </div>
        {activeJob && (
          <div className="flex items-center gap-2 bg-blue-900/30 border border-blue-800 text-blue-300 px-4 py-2 rounded-lg text-sm">
            <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
            Scan in progress
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-1">
            <CheckCircle2 size={20} className="text-green-400" />
            <span className="text-slate-400 text-sm">Confirmed</span>
          </div>
          <p className="text-3xl font-bold text-white">{totalConfirmed}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-1">
            <Clock size={20} className="text-orange-400" />
            <span className="text-slate-400 text-sm">Awaiting email</span>
          </div>
          <p className="text-3xl font-bold text-white">{totalPending}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-1">
            <AlertTriangle size={20} className="text-yellow-400" />
            <span className="text-slate-400 text-sm">Manual required</span>
          </div>
          <p className="text-3xl font-bold text-white">{totalManual}</p>
        </div>
      </div>

      <h2 className="text-lg font-semibold text-white mb-4">Profiles</h2>
      {stats.length === 0 ? (
        <div className="bg-slate-900 border border-dashed border-slate-700 rounded-xl p-12 text-center">
          <p className="text-slate-400 mb-4">No profiles yet.</p>
          <Link to="/profiles/new"
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm transition">
            Create first profile
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {stats.map(({ profile, optOuts }) => {
            const confirmed = optOuts.filter(o => o.status === 'confirmed').length
            const total     = optOuts.length
            const pct       = total > 0 ? Math.round((confirmed / total) * 100) : 0

            return (
              <div key={profile.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-white">{profile.label}</h3>
                    <span className="text-sm text-slate-400">{confirmed}/{total} confirmed</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <button
                  onClick={() => setScanProfile(profile)}
                  disabled={!!activeJob}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600/20 hover:bg-brand-600/30 text-brand-400 rounded-lg text-sm transition disabled:opacity-40">
                  <Play size={14} />
                  Scan
                </button>
                <Link to={`/profiles/${profile.id}`} className="text-slate-400 hover:text-white transition">
                  <ChevronRight size={18} />
                </Link>
              </div>
            )
          })}
        </div>
      )}

      {scanProfile && (
        <ScanModal
          profileLabel={scanProfile.label}
          onConfirm={handleScan}
          onCancel={() => setScanProfile(null)}
        />
      )}
    </div>
  )
}
