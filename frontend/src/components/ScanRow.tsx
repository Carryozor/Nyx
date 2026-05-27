import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle2, XCircle, Clock, Loader2, AlertTriangle,
  ChevronDown, ChevronRight, Trash2, ExternalLink,
} from 'lucide-react'
import { api } from '../api/client.js'
import { StatusBadge } from './StatusBadge.js'
import { useWsContext } from '../context/WebSocketContext.js'
import type { ScanJob, OptOutRequest } from '../types.js'

const SL_KEY       = 'nyx_simplelogin_key'
const SL_AUTOPURGE = 'nyx_sl_autopurge'

const FINAL_STATUSES = new Set(['confirmed', 'already_removed', 'failed', 'manual', 'submitted'])

const STATUS_GROUPS = [
  { label: 'Need manual action',          statuses: ['manual'] },
  { label: 'Awaiting email confirmation', statuses: ['awaiting_email'] },
  { label: 'Failed',                      statuses: ['failed'] },
  { label: 'Confirmed removed',           statuses: ['confirmed', 'already_removed'] },
  { label: 'Submitted',                   statuses: ['submitted'] },
  { label: 'Pending',                     statuses: ['pending', 'queued'] },
]

function getAutoPurge(): { enabled: boolean; days: number; autoDeleteWhenDone?: boolean } {
  try { return JSON.parse(localStorage.getItem(SL_AUTOPURGE) ?? '{}') }
  catch { return { enabled: false, days: 30 } }
}

function jobLabel(status: string, stats?: ScanJob['stats']): { text: string; color: string; icon: React.ReactNode } {
  if (status === 'queued')  return { text: 'Queued',  color: 'text-slate-400', icon: <Clock size={14} /> }
  if (status === 'running') return { text: 'Running', color: 'text-blue-400',  icon: <Loader2 size={14} className="animate-spin" /> }
  if (status === 'failed')  return { text: 'Failed',  color: 'text-red-400',   icon: <XCircle size={14} /> }
  const s = stats
  if (!s || s.total === 0) return { text: 'Done', color: 'text-green-400', icon: <CheckCircle2 size={14} /> }
  if (s.failed === s.total) return { text: 'All failed',     color: 'text-red-400',    icon: <XCircle size={14} /> }
  if (s.failed > 0)         return { text: 'Partial errors', color: 'text-orange-400', icon: <AlertTriangle size={14} /> }
  return                           { text: 'Done',           color: 'text-green-400',  icon: <CheckCircle2 size={14} /> }
}

function fmtDuration(start: string | null, end: string | null, created: string): string | null {
  if (!end) return null
  const s = Math.round((new Date(end).getTime() - new Date(start ?? created).getTime()) / 1000)
  return s < 60 ? `${s}s` : `${Math.round(s / 60)}m`
}

interface Props {
  job: ScanJob
  onAliasDeleted: (id: string) => void
  showProfileLink?: boolean
}

export function ScanRow({ job, onAliasDeleted, showProfileLink = false }: Props) {
  const { scans } = useWsContext()
  const live = scans.get(job.id)

  const [open, setOpen]         = useState(false)
  const [detail, setDetail]     = useState<ScanJob | null>(null)
  const [loading, setLoading]   = useState(false)
  const [deletingAlias, setDeletingAlias] = useState(false)

  // Use detail status when available (fixes "stuck as running" after scan completes)
  const effectiveStatus   = detail?.status ?? job.status
  const effectiveStats    = detail?.stats ?? job.stats
  const effectiveFinished = detail?.finished_at ?? job.finished_at
  const isRunning = effectiveStatus === 'running' || effectiveStatus === 'queued'

  const loadDetail = async () => {
    setLoading(true)
    try { setDetail(await api.scans.get(job.id) as ScanJob) }
    finally { setLoading(false) }
  }

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && !detail && !loading) await loadDetail()
  }

  // Reload from DB when WS marks scan complete
  useEffect(() => {
    if (live?.complete && open) loadDetail()
  }, [live?.complete])

  // Auto-delete alias based on settings
  const autoDeleteRanRef = useRef(false)
  useEffect(() => {
    if (autoDeleteRanRef.current) return
    if (!detail || (effectiveStatus !== 'done' && effectiveStatus !== 'failed')) return
    const aliasId = detail.simplelogin_alias_id
    if (!aliasId) return
    const slKey = localStorage.getItem(SL_KEY)?.trim()
    if (!slKey) return

    const cfg = getAutoPurge()
    const optOuts = detail.opt_outs ?? []
    const allFinal = optOuts.length > 0 && optOuts.every(o => FINAL_STATUSES.has(o.status))

    if (allFinal && cfg.autoDeleteWhenDone) {
      autoDeleteRanRef.current = true
      api.simplelogin.deleteAlias(slKey, aliasId).catch(() => {})
      onAliasDeleted(job.id)
      return
    }

    if (cfg.enabled && cfg.days > 0 && effectiveFinished) {
      const elapsed = (Date.now() - new Date(effectiveFinished).getTime()) / 86_400_000
      if (elapsed >= cfg.days) {
        autoDeleteRanRef.current = true
        api.simplelogin.deleteAlias(slKey, aliasId).catch(() => {})
        onAliasDeleted(job.id)
      }
    }
  }, [detail])

  const deleteAlias = async () => {
    const key = localStorage.getItem(SL_KEY)?.trim()
    const aliasId = detail?.simplelogin_alias_id ?? job.simplelogin_alias_id
    if (!key || !aliasId) return
    setDeletingAlias(true)
    try {
      await api.simplelogin.deleteAlias(key, aliasId)
      onAliasDeleted(job.id)
      setDetail(prev => prev ? { ...prev, simplelogin_alias_id: null, confirmation_email: null } : null)
    } catch { /* alias may already be gone */ }
    finally { setDeletingAlias(false) }
  }

  const optOuts: OptOutRequest[]  = detail?.opt_outs ?? []
  const startedAt = detail?.started_at ?? job.started_at
  const aliasId = detail?.simplelogin_alias_id ?? job.simplelogin_alias_id
  const confirmEmail = detail?.confirmation_email ?? job.confirmation_email
  const slKey = localStorage.getItem(SL_KEY)

  const effectiveStatus_oo = (oo: OptOutRequest): string => {
    if (!isRunning || !startedAt) return oo.status
    const liveStatus = live?.brokerStatus.get(oo.broker_id)
    if (liveStatus) return liveStatus
    if (oo.last_attempt && new Date(oo.last_attempt) > new Date(startedAt)) return oo.status
    return 'queued'
  }

  const isProcessed = (oo: OptOutRequest) => {
    if (!isRunning) return true
    const liveStatus = live?.brokerStatus.get(oo.broker_id)
    if (liveStatus && liveStatus !== 'running') return true
    if (oo.last_attempt && startedAt && new Date(oo.last_attempt) > new Date(startedAt)) return true
    return false
  }

  const isCurrent = (oo: OptOutRequest) => live?.currentBroker === oo.broker_id

  // Live notes: prefer WS event notes (fresh), fall back to DB notes
  const liveNotes = (oo: OptOutRequest): string | null => {
    return live?.brokerNotes.get(oo.broker_id) ?? oo.notes ?? null
  }

  const { text, color, icon } = jobLabel(
    isRunning && live ? 'running' : effectiveStatus,
    effectiveStats,
  )
  const dur = fmtDuration(job.started_at, effectiveFinished, job.created_at)
  const s = effectiveStats

  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <button onClick={toggle} className="w-full text-left bg-slate-900 px-4 py-4 hover:bg-slate-800/60 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-slate-500">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
            <span className={`flex items-center gap-1.5 text-sm font-medium ${color}`}>
              {icon}
              {isRunning && live
                ? `Running — ${live.done}${live.total > 0 ? `/${live.total}` : ''} brokers`
                : text}
            </span>
            <span className="text-slate-500 text-sm">{new Date(job.created_at).toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-4">
            {dur && <span className="text-xs text-slate-500">{dur}</span>}
            {s && s.total > 0 && !isRunning && (
              <div className="flex items-center gap-3 text-xs">
                {s.confirmed > 0    && <span className="flex items-center gap-1 text-green-400"><CheckCircle2 size={11} /> {s.confirmed}</span>}
                {s.awaiting_email > 0 && <span className="flex items-center gap-1 text-orange-400"><Clock size={11} /> {s.awaiting_email}</span>}
                {s.submitted > 0    && <span className="flex items-center gap-1 text-yellow-400"><CheckCircle2 size={11} /> {s.submitted}</span>}
                {s.failed > 0       && <span className="flex items-center gap-1 text-red-400"><XCircle size={11} /> {s.failed}</span>}
                <span className="text-slate-600">{s.total}</span>
              </div>
            )}
            {showProfileLink && (
              <Link to={`/profiles/${job.profile_id}`} className="text-xs text-brand-400 hover:underline" onClick={e => e.stopPropagation()}>
                profile
              </Link>
            )}
          </div>
        </div>

        {/* Progress bar while running */}
        {isRunning && live && live.total > 0 && (
          <div className="mt-3 h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 transition-all duration-500 rounded-full"
              style={{ width: `${Math.round((live.done / live.total) * 100)}%` }}
            />
          </div>
        )}
      </button>

      {/* ── Expanded detail ──────────────────────────────────────────────────── */}
      {open && (
        <div className="border-t border-slate-800 bg-slate-950">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-slate-400">
              <Loader2 size={16} className="animate-spin" /> <span className="text-sm">Loading…</span>
            </div>
          ) : (
            <div className="p-4">
              {/* Confirmation email + alias delete */}
              {(confirmEmail || aliasId) && (
                <div className="flex items-center justify-between mb-4 p-3 bg-slate-900 border border-slate-800 rounded-lg">
                  <div className="text-xs text-slate-400">
                    <span className="text-slate-500">Confirmation email:</span>{' '}
                    <span className="font-mono text-slate-300">{confirmEmail ?? '—'}</span>
                  </div>
                  {aliasId && slKey && (
                    <button
                      onClick={e => { e.stopPropagation(); deleteAlias() }}
                      disabled={deletingAlias}
                      title="Delete SimpleLogin alias"
                      className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition disabled:opacity-50"
                    >
                      {deletingAlias ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      Delete alias
                    </button>
                  )}
                </div>
              )}

              {/* Broker list */}
              {optOuts.length === 0 && !live ? (
                <p className="py-4 text-center text-slate-500 text-sm">No opt-out requests recorded.</p>
              ) : isRunning ? (
                // ── Live view ──────────────────────────────────────────────
                <div>
                  <p className="text-xs text-slate-500 mb-3">
                    {live ? `${live.done} processed${live.total > 0 ? ` / ${live.total} total` : ''}` : 'Loading…'}
                  </p>
                  <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden">
                    {optOuts.map((oo: OptOutRequest) => {
                      const st = effectiveStatus_oo(oo)
                      const processed = isProcessed(oo)
                      const current   = isCurrent(oo)
                      const notes     = processed ? liveNotes(oo) : null
                      return (
                        <div key={oo.id} className={`px-4 py-2.5 flex items-center justify-between gap-4 ${current ? 'bg-blue-950/30' : 'bg-slate-900'}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            {current && <Loader2 size={12} className="animate-spin text-blue-400 shrink-0" />}
                            <span className="text-sm text-white truncate">{oo.broker_name ?? oo.broker_id}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {notes && (
                              <span className="text-xs text-slate-500 max-w-[200px] truncate" title={notes}>{notes}</span>
                            )}
                            {processed
                              ? <StatusBadge status={st} />
                              : <span className="text-xs text-slate-500 flex items-center gap-1"><Clock size={11} /> pending</span>
                            }
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                // ── Final grouped view ─────────────────────────────────────
                <div className="space-y-4">
                  {STATUS_GROUPS.map(({ label, statuses }) => {
                    const items = optOuts.filter((o: OptOutRequest) => statuses.includes(o.status))
                    if (items.length === 0) return null
                    return (
                      <div key={label}>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                          {label} <span className="font-normal">({items.length})</span>
                        </p>
                        <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden">
                          {items.map((oo: OptOutRequest) => (
                            <div key={oo.id} className="bg-slate-900 px-4 py-2.5 flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-sm text-white truncate">{oo.broker_name ?? oo.broker_id}</span>
                                {oo.broker_type && (
                                  <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                                    oo.broker_type === 'auto' ? 'bg-green-900/40 text-green-400' :
                                    oo.broker_type === 'semi' ? 'bg-yellow-900/40 text-yellow-400' :
                                    'bg-slate-700 text-slate-400'
                                  }`}>{oo.broker_type}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                {oo.attempts > 0 && <span className="text-xs text-slate-500">{oo.attempts} att.</span>}
                                {oo.notes && <span className="text-xs text-slate-500 max-w-[200px] truncate" title={oo.notes}>{oo.notes}</span>}
                                {oo.status === 'manual' && oo.broker_url && (
                                  <a
                                    href={oo.broker_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition"
                                  >
                                    <ExternalLink size={11} /> Go
                                  </a>
                                )}
                                <StatusBadge status={oo.status} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
