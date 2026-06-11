import { useEffect } from 'react'
import { X, Loader2, CheckCircle } from 'lucide-react'
import type { ScanProgress as ScanProgressType } from '../context/WebSocketContext.js'

interface Props {
  scans:     Map<string, ScanProgressType>
  onDismiss: (jobId: string) => void
}

export function ScanProgress({ scans, onDismiss }: Props) {
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    for (const scan of scans.values()) {
      const done = scan.done >= scan.total && scan.total > 0
      if (done) {
        timers.push(setTimeout(() => onDismiss(scan.jobId), 6000))
      }
    }
    return () => timers.forEach(clearTimeout)
  }, [scans, onDismiss])

  if (scans.size === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-40 space-y-3 w-80">
      {Array.from(scans.values()).map(scan => {
        const pct  = scan.total > 0 ? Math.round((scan.done / scan.total) * 100) : 0
        const done = scan.done >= scan.total && scan.total > 0

        return (
          <div key={scan.jobId} className="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-2xl">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {done
                  ? <CheckCircle size={16} className="text-green-400" />
                  : <Loader2 size={16} className="text-brand-400 animate-spin" />}
                <span className="text-sm font-medium text-white">
                  {done ? 'Scan complete' : 'Scanning brokers…'}
                </span>
              </div>
              <button onClick={() => onDismiss(scan.jobId)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            {scan.currentBroker && !done && (
              <p className="text-xs text-slate-400 mb-2 truncate">{scan.currentBroker}</p>
            )}
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500 transition-all duration-300 rounded-full"
                style={{ width: `${done ? 100 : Math.max(pct, 3)}%` }}
              />
            </div>
            {scan.total > 0 && (
              <p className="text-xs text-slate-500 mt-1 text-right">
                {scan.done}/{scan.total} brokers
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
