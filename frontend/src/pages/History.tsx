import { useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { StatusBadge } from '../components/StatusBadge.js'
import type { ScanJob } from '../types.js'

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
          {jobs.map(job => (
            <div key={job.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusBadge status={job.status} />
                  <span className="text-sm text-slate-400">
                    {new Date(job.created_at).toLocaleString()}
                  </span>
                </div>
                {job.finished_at && (
                  <span className="text-xs text-slate-500">
                    Duration: {Math.round((new Date(job.finished_at).getTime() - new Date(job.created_at).getTime()) / 60000)}m
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
