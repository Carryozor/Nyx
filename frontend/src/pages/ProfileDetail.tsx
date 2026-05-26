import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft, Play, Shield, CheckCircle2, Clock, AlertTriangle, XCircle } from 'lucide-react'
import { api } from '../api/client.js'
import { StatusBadge } from '../components/StatusBadge.js'
import { PasswordModal } from '../components/PasswordModal.js'
import type { Profile, OptOutRequest, ScanJob } from '../types.js'

export function ProfileDetail() {
  const { id }                    = useParams<{ id: string }>()
  const [profile, setProfile]     = useState<Profile | null>(null)
  const [optOuts, setOptOuts]     = useState<OptOutRequest[]>([])
  const [jobs, setJobs]           = useState<ScanJob[]>([])
  const [loading, setLoading]     = useState(true)
  const [showScan, setShowScan]   = useState(false)
  const [error, setError]         = useState('')

  const load = async () => {
    if (!id) return
    try {
      const [p, oo, scans] = await Promise.all([
        api.profiles.get(id) as Promise<Profile>,
        api.optOuts.forProfile(id) as Promise<OptOutRequest[]>,
        api.scans.list() as Promise<ScanJob[]>,
      ])
      setProfile(p)
      setOptOuts(oo)
      setJobs(scans.filter(j => j.profile_id === id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  const handleScan = async (password: string) => {
    if (!id) return
    await api.scans.create(id, password)
    setShowScan(false)
    load()
  }

  const activeJob = jobs.find(j => j.status === 'running' || j.status === 'queued')

  const counts = {
    confirmed:      optOuts.filter(o => o.status === 'confirmed').length,
    awaiting_email: optOuts.filter(o => o.status === 'awaiting_email').length,
    manual:         optOuts.filter(o => o.status === 'manual').length,
    failed:         optOuts.filter(o => o.status === 'failed').length,
  }

  const byStatus = (statuses: string[]) => optOuts.filter(o => statuses.includes(o.status))

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>
  if (error)   return <div className="p-8 text-red-400">{error}</div>
  if (!profile) return <div className="p-8 text-slate-400">Profile not found.</div>

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/profiles" className="text-slate-400 hover:text-white transition">
          <ChevronLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{profile.label}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Created {new Date(profile.created_at).toLocaleDateString()}
          </p>
        </div>
        <button
          onClick={() => setShowScan(true)}
          disabled={!!activeJob}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-40">
          <Play size={14} />
          {activeJob ? 'Scan in progress…' : 'Scan now'}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1"><CheckCircle2 size={16} className="text-green-400" /><span className="text-xs text-slate-400">Confirmed</span></div>
          <p className="text-2xl font-bold text-white">{counts.confirmed}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1"><Clock size={16} className="text-orange-400" /><span className="text-xs text-slate-400">Email pending</span></div>
          <p className="text-2xl font-bold text-white">{counts.awaiting_email}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1"><AlertTriangle size={16} className="text-yellow-400" /><span className="text-xs text-slate-400">Manual</span></div>
          <p className="text-2xl font-bold text-white">{counts.manual}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1"><XCircle size={16} className="text-red-400" /><span className="text-xs text-slate-400">Failed</span></div>
          <p className="text-2xl font-bold text-white">{counts.failed}</p>
        </div>
      </div>

      {/* Scan history */}
      {jobs.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Scan history</h2>
          <div className="space-y-2">
            {jobs.slice(0, 5).map(job => (
              <div key={job.id} className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusBadge status={job.status} />
                  <span className="text-sm text-slate-400">{new Date(job.created_at).toLocaleString()}</span>
                </div>
                {job.finished_at && (
                  <span className="text-xs text-slate-500">
                    {Math.round((new Date(job.finished_at).getTime() - new Date(job.created_at).getTime()) / 60000)}m
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Opt-out requests */}
      {optOuts.length === 0 ? (
        <div className="bg-slate-900 border border-dashed border-slate-700 rounded-xl p-12 text-center">
          <Shield size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 mb-2">No opt-out requests yet.</p>
          <p className="text-slate-500 text-sm">Start a scan to automatically submit opt-out requests to all brokers.</p>
        </div>
      ) : (
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Opt-out requests ({optOuts.length} brokers)
          </h2>

          {[
            { label: 'Need manual action', statuses: ['manual'] },
            { label: 'Awaiting email confirmation', statuses: ['awaiting_email'] },
            { label: 'Failed', statuses: ['failed'] },
            { label: 'Confirmed removed', statuses: ['confirmed', 'already_removed'] },
            { label: 'Submitted', statuses: ['submitted'] },
            { label: 'Pending', statuses: ['pending', 'queued'] },
          ].map(({ label, statuses }) => {
            const items = byStatus(statuses)
            if (items.length === 0) return null
            return (
              <div key={label} className="mb-6">
                <h3 className="text-xs text-slate-500 mb-2">{label} ({items.length})</h3>
                <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden">
                  {items.map(oo => (
                    <div key={oo.id} className="bg-slate-900 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-white">{oo.broker_name ?? oo.broker_id}</span>
                        {oo.broker_type && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${oo.broker_type === 'auto' ? 'bg-green-900/40 text-green-400' : oo.broker_type === 'semi' ? 'bg-yellow-900/40 text-yellow-400' : 'bg-slate-700 text-slate-400'}`}>
                            {oo.broker_type}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {oo.attempts > 0 && <span className="text-xs text-slate-500">{oo.attempts} attempt{oo.attempts > 1 ? 's' : ''}</span>}
                        <StatusBadge status={oo.status} />
                        {oo.broker_type === 'manual' && (
                          <Link to="/guide" className="text-xs text-brand-400 hover:underline">guide</Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showScan && (
        <PasswordModal
          title={`Scan "${profile.label}"`}
          onConfirm={handleScan}
          onCancel={() => setShowScan(false)}
        />
      )}
    </div>
  )
}
