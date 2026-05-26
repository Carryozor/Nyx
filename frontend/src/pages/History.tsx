import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, XCircle, Clock, Loader2, AlertTriangle } from 'lucide-react'
import { api } from '../api/client.js'
import type { ScanJob } from '../types.js'

function jobLabel(job: ScanJob): { text: string; color: string; icon: React.ReactNode } {
  if (job.status === 'queued')  return { text: 'Queued',  color: 'text-slate-400', icon: <Clock size={14} /> }
  if (job.status === 'running') return { text: 'Running', color: 'text-blue-400',  icon: <Loader2 size={14} className="animate-spin" /> }
  if (job.status === 'failed')  return { text: 'Failed',  color: 'text-red-400',   icon: <XCircle size={14} /> }

  // status === 'done' — look at broker outcomes
  const s = job.stats
  if (!s || s.total === 0) return { text: 'Done', color: 'text-green-400', icon: <CheckCircle2 size={14} /> }

  const allFailed = s.failed === s.total
  const hasFailed = s.failed > 0
  const allOk     = s.confirmed + s.awaiting_email + s.submitted === s.total

  if (allFailed)  return { text: 'All failed',     color: 'text-red-400',    icon: <XCircle size={14} /> }
  if (allOk)      return { text: 'Done',            color: 'text-green-400',  icon: <CheckCircle2 size={14} /> }
  if (hasFailed)  return { text: 'Partial errors',  color: 'text-orange-400', icon: <AlertTriangle size={14} /> }
  return           { text: 'Done',                   color: 'text-green-400',  icon: <CheckCircle2 size={14} /> }
}

function duration(job: ScanJob): string | null {
  if (!job.finished_at || !job.started_at) return null
  const ms = new Date(job.finished_at).getTime() - new Date(job.started_at).getTime()
  const s  = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.round(s / 60)}m`
}

export function History() {
  const [jobs, setJobs]       = useState<ScanJob[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.scans.list().then(data => {
      setJobs(data as ScanJob[])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-6">Scan history</h1>

      {jobs.length === 0 ? (
        <div className="text-slate-400">No scans yet.</div>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => {
            const { text, color, icon } = jobLabel(job)
            const s = job.stats
            const dur = duration(job)

            return (
              <div key={job.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`flex items-center gap-1.5 text-sm font-medium ${color}`}>
                      {icon} {text}
                    </span>
                    <span className="text-slate-500 text-sm">{new Date(job.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {dur && <span className="text-xs text-slate-500">{dur}</span>}
                    <Link to={`/profiles/${job.profile_id}`}
                      className="text-xs text-brand-400 hover:underline">view profile</Link>
                  </div>
                </div>

                {s && s.total > 0 && (
                  <div className="flex items-center gap-4 text-xs mt-1">
                    {s.confirmed > 0 && (
                      <span className="flex items-center gap-1 text-green-400">
                        <CheckCircle2 size={11} /> {s.confirmed} confirmed
                      </span>
                    )}
                    {s.awaiting_email > 0 && (
                      <span className="flex items-center gap-1 text-orange-400">
                        <Clock size={11} /> {s.awaiting_email} awaiting email
                      </span>
                    )}
                    {s.submitted > 0 && (
                      <span className="flex items-center gap-1 text-yellow-400">
                        <CheckCircle2 size={11} /> {s.submitted} submitted
                      </span>
                    )}
                    {s.failed > 0 && (
                      <span className="flex items-center gap-1 text-red-400">
                        <XCircle size={11} /> {s.failed} failed
                      </span>
                    )}
                    <span className="text-slate-600 ml-auto">{s.total} brokers</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
