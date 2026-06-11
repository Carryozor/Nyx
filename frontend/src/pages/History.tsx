import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client.js'
import { ScanRow } from '../components/ScanRow.js'
import { useWsContext } from '../context/WebSocketContext.js'
import type { ScanJob } from '../types.js'

export function History() {
  const [jobs, setJobs]       = useState<ScanJob[]>([])
  const [loading, setLoading] = useState(true)
  const { scans } = useWsContext()

  const reload = () => {
    api.scans.list()
      .then(data => setJobs(data as ScanJob[]))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [])

  // Reload jobs list when any scan completes via WS so headers show final status
  const seenComplete = useRef(new Set<string>())
  useEffect(() => {
    let needsReload = false
    scans.forEach((scan, jobId) => {
      if (scan.complete && !seenComplete.current.has(jobId)) {
        seenComplete.current.add(jobId)
        needsReload = true
      }
    })
    if (needsReload) reload()
  }, [scans])

  const handleAliasDeleted = (jobId: string) => {
    setJobs(prev => prev.map(j =>
      j.id === jobId ? { ...j, simplelogin_alias_id: null, confirmation_email: null } : j
    ))
  }

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-white mb-6">Scan history</h1>
      {jobs.length === 0 ? (
        <div className="text-slate-400">No scans yet.</div>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => (
            <ScanRow key={job.id} job={job} onAliasDeleted={handleAliasDeleted} showProfileLink />
          ))}
        </div>
      )}
    </div>
  )
}
