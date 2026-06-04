import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { api } from '../api/client.js'
import { StatusBadge } from '../components/StatusBadge.js'
import { BrokerReportPanel } from '../components/BrokerReportPanel.js'
import type { Broker, OptOutRequest, Profile } from '../types.js'

type FilterType = 'all' | 'auto' | 'semi' | 'manual'

export function Brokers() {
  const [brokers, setBrokers]         = useState<Broker[]>([])
  const [profiles, setProfiles]       = useState<Profile[]>([])
  const [selectedProfile, setProfile] = useState<string>('')
  const [optOuts, setOptOuts]         = useState<OptOutRequest[]>([])
  const [selectedOptOut, setSelectedOptOut] = useState<OptOutRequest | null>(null)
  const [filter, setFilter]           = useState<FilterType>('all')
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    Promise.all([api.brokers.list(), api.profiles.list()]).then(([b, p]) => {
      setBrokers(b as Broker[])
      const ps = p as Profile[]
      setProfiles(ps)
      if (ps.length > 0) setProfile(ps[0].id)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (selectedProfile) {
      api.optOuts.forProfile(selectedProfile).then(data => setOptOuts(data as OptOutRequest[]))
    }
  }, [selectedProfile])

  const filtered = filter === 'all' ? brokers : brokers.filter(b => b.type === filter)

  const getStatus = (brokerId: string) =>
    optOuts.find(o => o.broker_id === brokerId)?.status ?? 'pending'

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden border-r border-slate-800">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-white">Brokers</h1>
            {profiles.length > 1 && (
              <select value={selectedProfile} onChange={e => setProfile(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none">
                {profiles.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            )}
          </div>
          <div className="flex gap-2">
            {(['all','auto','semi','manual'] as FilterType[]).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-lg text-sm transition ${filter === f ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                {f === 'all' ? 'All' : f === 'auto' ? 'Automated' : f === 'semi' ? 'Semi-auto' : 'Manual'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-800">
          {filtered.map(broker => (
            <button key={broker.id} onClick={() => {
                const oo = optOuts.find(o => o.broker_id === broker.id) ?? null
                setSelectedOptOut(prev =>
                  prev?.broker_id === broker.id
                    ? null
                    : oo ? { ...oo, broker_name: broker.name, broker_type: broker.type, broker_url: broker.url } : null
                )
              }}
              className={`w-full flex items-center px-6 py-4 hover:bg-slate-900/50 transition text-left ${selectedOptOut?.broker_id === broker.id ? 'bg-slate-900/50' : ''}`}>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white text-sm font-medium">{broker.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${broker.type === 'auto' ? 'bg-green-900/50 text-green-400' : broker.type === 'semi' ? 'bg-yellow-900/50 text-yellow-400' : 'bg-slate-700 text-slate-400'}`}>
                    {broker.type}
                  </span>
                </div>
                <StatusBadge status={getStatus(broker.id)} />
              </div>
              <ChevronRight size={16} className="text-slate-600" />
            </button>
          ))}
        </div>
      </div>

      <BrokerReportPanel optOut={selectedOptOut} onClose={() => setSelectedOptOut(null)} />
    </div>
  )
}
