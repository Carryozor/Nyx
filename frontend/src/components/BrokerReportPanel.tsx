import { useEffect, useRef, useState } from 'react'
import { X, Mail, BookOpen } from 'lucide-react'
import { api } from '../api/client.js'
import { StatusBadge } from './StatusBadge.js'
import type { OptOutRequest } from '../types.js'

interface Screenshot { filename: string; url: string }

interface BrokerReportPanelProps {
  optOut: OptOutRequest | null
  onClose: () => void
}

function Section({ title }: { title: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2 mt-4 first:mt-0">
      {title}
    </p>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start text-sm mb-1.5">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-200 text-right max-w-[220px]">{value}</span>
    </div>
  )
}

function fmt(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

export function BrokerReportPanel({ optOut, onClose }: BrokerReportPanelProps) {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [activeShot, setActiveShot] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    setScreenshots([])
    setActiveShot(0)
    if (!optOut?.screenshot) return
    api.optOuts.screenshots(optOut.id).then(setScreenshots).catch(() => {})
  }, [optOut?.id, optOut?.screenshot])

  if (!optOut) return null

  return (
    <div
      ref={panelRef}
      className="fixed inset-y-0 right-0 w-[360px] bg-slate-950 border-l border-slate-800
        shadow-2xl overflow-y-auto z-50 flex flex-col"
    >
      <div className="flex items-start justify-between p-4 border-b border-slate-800 sticky top-0 bg-slate-950">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-white truncate">
            {optOut.broker_name ?? optOut.broker_id}
          </h2>
          {optOut.broker_url && (
            <a
              href={optOut.broker_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-violet-400 hover:underline truncate block mt-0.5"
            >
              {optOut.broker_url.replace(/^https?:\/\//, '')}
            </a>
          )}
        </div>
        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
          <StatusBadge status={optOut.status} />
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="p-4 flex-1">
        <Section title="Résultat" />
        <Field label="Tentatives" value={`${optOut.attempts}`} />
        <Field label="Dernier essai" value={fmt(optOut.last_attempt)} />
        <Field label="Soumis le" value={fmt(optOut.submitted_at)} />
        {optOut.confirmed_at && (
          <Field label="Confirmé le" value={fmt(optOut.confirmed_at)} />
        )}

        {optOut.notes && (
          <>
            <Section title="Raison" />
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-[12px] text-slate-400 leading-relaxed">
              {optOut.notes}
            </div>
          </>
        )}

        {optOut.status === 'awaiting_email' && optOut.confirmation_pattern && (
          <>
            <Section title="Email de confirmation attendu" />
            <div className="flex items-center gap-2 bg-slate-900 border border-green-900/40 rounded-lg p-2.5">
              <Mail size={13} className="text-green-400 flex-shrink-0" />
              <code className="text-[11px] text-green-400 font-mono">{optOut.confirmation_pattern}</code>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
              Nyx détectera automatiquement l'email et passera le statut à{' '}
              <strong className="text-green-400">confirmed</strong>.
            </p>
          </>
        )}

        {screenshots.length > 0 && (
          <>
            <Section title="Screenshots" />
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
              <div className="flex border-b border-slate-800 overflow-x-auto">
                {screenshots.map((s, i) => (
                  <button
                    key={s.filename}
                    onClick={() => setActiveShot(i)}
                    className={`px-3 py-1.5 text-[10px] whitespace-nowrap transition flex-shrink-0 ${
                      i === activeShot
                        ? 'text-violet-400 border-b-2 border-violet-500'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {s.filename}
                  </button>
                ))}
              </div>
              <div className="p-2">
                <img
                  src={screenshots[activeShot].url}
                  alt={screenshots[activeShot].filename}
                  className="w-full rounded object-contain"
                  style={{ aspectRatio: '16/9', background: '#0f172a' }}
                />
              </div>
            </div>
          </>
        )}

        {optOut.manual_guide && (
          <>
            <Section title="Guide de suppression manuelle" />
            <div className="flex items-center gap-1.5 mb-2">
              <BookOpen size={12} className="text-violet-400" />
              <span className="text-[11px] text-violet-400">Instructions étape par étape</span>
            </div>
            <div className="bg-slate-900 border border-violet-900/30 rounded-lg p-3
              text-[12px] text-slate-400 whitespace-pre-wrap leading-relaxed">
              {optOut.manual_guide}
            </div>
          </>
        )}

        <Section title="Broker" />
        <Field label="Type" value={optOut.broker_type ?? '—'} />
        <Field label="Pays" value="US" />
      </div>
    </div>
  )
}
