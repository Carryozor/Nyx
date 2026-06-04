import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ChevronLeft, CheckCircle2, XCircle, Clock, Loader2, AlertTriangle, Mail,
} from 'lucide-react'
import { api } from '../api/client.js'
import { StatusBadge } from '../components/StatusBadge.js'
import { BrokerReportPanel } from '../components/BrokerReportPanel.js'
import type { ScanJob, OptOutRequest } from '../types.js'

function duration(job: ScanJob): string | null {
  const start = job.started_at ?? job.created_at
  if (!job.finished_at) return null
  const s = Math.round((new Date(job.finished_at).getTime() - new Date(start).getTime()) / 1000)
  return s < 60 ? `${s}s` : `${Math.round(s / 60)}m`
}

function ScanStatusChip({ status }: { status: ScanJob['status'] }) {
  if (status === 'queued')  return <span className="flex items-center gap-1.5 text-slate-400 text-sm"><Clock size={14} /> Queued</span>
  if (status === 'running') return <span className="flex items-center gap-1.5 text-blue-400 text-sm"><Loader2 size={14} className="animate-spin" /> Running</span>
  if (status === 'failed')  return <span className="flex items-center gap-1.5 text-red-400 text-sm"><XCircle size={14} /> Failed</span>
  return <span className="flex items-center gap-1.5 text-green-400 text-sm"><CheckCircle2 size={14} /> Done</span>
}

const STATUS_GROUPS = [
  { label: 'Need manual action',          statuses: ['manual'] },
  { label: 'Awaiting email confirmation', statuses: ['awaiting_email'] },
  { label: 'Failed',                      statuses: ['failed'] },
  { label: 'Confirmed removed',           statuses: ['confirmed', 'already_removed'] },
  { label: 'Submitted',                   statuses: ['submitted'] },
  { label: 'Pending',                     statuses: ['pending', 'queued'] },
]

export function ScanDetail() {
  const { id } = useParams<{ id: string }>()
  const [job, setJob]                 = useState<ScanJob | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [selectedOptOut, setSelected] = useState<OptOutRequest | null>(null)

  useEffect(() => {
    if (!id) return
    api.scans.get(id)
      .then(data => setJob(data as ScanJob))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>
  if (error)   return <div className="p-8 text-red-400">{error}</div>
  if (!job)    return <div className="p-8 text-slate-400">Scan not found.</div>

  const optOuts = job.opt_outs ?? []
  const dur = duration(job)

  const counts = {
    confirmed:      optOuts.filter(o => o.status === 'confirmed' || o.status === 'already_removed').length,
    awaiting_email: optOuts.filter(o => o.status === 'awaiting_email').length,
    failed:         optOuts.filter(o => o.status === 'failed').length,
    manual:         optOuts.filter(o => o.status === 'manual').length,
    submitted:      optOuts.filter(o => o.status === 'submitted').length,
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/history" className="text-slate-400 hover:text-white transition">
          <ChevronLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Scan detail</h1>
          {job.profile_label && (
            <p className="text-sm text-slate-400 mt-0.5">
              Profile:{' '}
              <Link to={`/profiles/${job.profile_id}`} className="text-brand-400 hover:underline">
                {job.profile_label}
              </Link>
            </p>
          )}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6 flex flex-wrap gap-6">
        <div><p className="text-xs text-slate-500 mb-1">Status</p><ScanStatusChip status={job.status} /></div>
        <div><p className="text-xs text-slate-500 mb-1">Started</p><p className="text-sm text-white">{new Date(job.created_at).toLocaleString()}</p></div>
        {dur && <div><p className="text-xs text-slate-500 mb-1">Duration</p><p className="text-sm text-white">{dur}</p></div>}
        {job.confirmation_email && (
          <div>
            <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Mail size={11} /> Confirmation email</p>
            <p className="text-sm text-white font-mono">{job.confirmation_email}</p>
          </div>
        )}
        <div><p className="text-xs text-slate-500 mb-1">Brokers</p><p className="text-sm text-white">{optOuts.length}</p></div>
      </div>

      {optOuts.length > 0 && (
        <div className="grid grid-cols-5 gap-2 mb-6">
          {[
            { label: 'Confirmed',     value: counts.confirmed,      icon: <CheckCircle2 size={14} className="text-green-400"  />, color: 'text-green-400'  },
            { label: 'Email pending', value: counts.awaiting_email, icon: <Clock size={14} className="text-orange-400" />,        color: 'text-orange-400' },
            { label: 'Submitted',     value: counts.submitted,      icon: <CheckCircle2 size={14} className="text-yellow-400" />, color: 'text-yellow-400' },
            { label: 'Manual',        value: counts.manual,         icon: <AlertTriangle size={14} className="text-yellow-400" />,color: 'text-yellow-400' },
            { label: 'Failed',        value: counts.failed,         icon: <XCircle size={14} className="text-red-400"   />,       color: 'text-red-400'   },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
              <div className={`flex justify-center mb-1 ${color}`}>{icon}</div>
              <p className="text-xl font-bold text-white">{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {optOuts.length === 0 ? (
        <div className="text-slate-400 text-sm">No opt-out requests for this scan.</div>
      ) : (
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Opt-out requests
          </h2>
          {STATUS_GROUPS.map(({ label, statuses }) => {
            const items = optOuts.filter((o: OptOutRequest) => statuses.includes(o.status))
            if (items.length === 0) return null
            return (
              <div key={label} className="mb-5">
                <h3 className="text-xs text-slate-500 mb-2">{label} ({items.length})</h3>
                <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden">
                  {items.map((oo: OptOutRequest) => (
                    <button
                      key={oo.id}
                      onClick={() => setSelected(prev => prev?.id === oo.id ? null : oo)}
                      className={`w-full bg-slate-900 px-4 py-3 flex items-center justify-between
                        hover:bg-slate-800/60 transition text-left
                        ${selectedOptOut?.id === oo.id ? 'ring-1 ring-inset ring-brand-500/40 bg-slate-800/60' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-white">{oo.broker_name ?? oo.broker_id}</span>
                        {oo.broker_type && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            oo.broker_type === 'auto' ? 'bg-green-900/40 text-green-400' :
                            oo.broker_type === 'semi' ? 'bg-yellow-900/40 text-yellow-400' :
                            'bg-slate-700 text-slate-400'
                          }`}>
                            {oo.broker_type}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {oo.attempts > 0 && (
                          <span className="text-xs text-slate-500">{oo.attempts} attempt{oo.attempts > 1 ? 's' : ''}</span>
                        )}
                        <StatusBadge status={oo.status} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <BrokerReportPanel optOut={selectedOptOut} onClose={() => setSelected(null)} />
    </div>
  )
}
