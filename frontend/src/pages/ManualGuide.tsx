import { useEffect, useState } from 'react'
import { ExternalLink, BookOpen } from 'lucide-react'
import { api } from '../api/client.js'
import type { Broker } from '../types.js'

export function ManualGuide() {
  const [brokers, setBrokers]   = useState<Broker[]>([])
  const [selected, setSelected] = useState<Broker | null>(null)

  useEffect(() => {
    api.brokers.list('manual').then(data => {
      const b = data as Broker[]
      setBrokers(b)
      if (b.length > 0) setSelected(b[0])
    })
  }, [])

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="w-64 flex-shrink-0 border-r border-slate-800 overflow-y-auto bg-slate-900/20">
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center gap-2 text-white font-semibold">
            <BookOpen size={18} />
            Manual brokers
          </div>
          <p className="text-xs text-slate-400 mt-1">{brokers.length} brokers requiring manual action</p>
        </div>
        {brokers.map(b => (
          <button key={b.id} onClick={() => setSelected(b)}
            className={`w-full px-4 py-3 text-left text-sm transition border-b border-slate-800 ${selected?.id === b.id ? 'bg-brand-600/20 text-brand-300' : 'text-slate-300 hover:bg-slate-800'}`}>
            {b.name}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {selected ? (
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-6">
              <h1 className="text-2xl font-bold text-white">{selected.name}</h1>
              <a href={selected.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-brand-400 hover:underline">
                Visit site <ExternalLink size={14} />
              </a>
            </div>
            {selected.manual_guide ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <pre className="whitespace-pre-wrap text-slate-200 text-sm leading-relaxed font-sans">
                  {selected.manual_guide}
                </pre>
              </div>
            ) : (
              <div className="text-slate-400">No guide available for this broker yet.</div>
            )}
          </div>
        ) : (
          <div className="text-slate-400">Select a broker from the list.</div>
        )}
      </div>
    </div>
  )
}
