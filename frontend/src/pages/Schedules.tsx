import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, ChevronRight, Clock } from 'lucide-react'
import { api } from '../api/client.js'
import { PasswordModal } from '../components/PasswordModal.js'
import { SCAN_INTERVALS, intervalLabel } from '../lib/intervals.js'
import type { Profile, ScanSchedule } from '../types.js'

interface ProfileWithSchedule {
  profile:  Profile
  schedule: ScanSchedule | null
}

const INTERVALS = SCAN_INTERVALS

export function Schedules() {
  const [items, setItems]           = useState<ProfileWithSchedule[]>([])
  const [loading, setLoading]       = useState(true)
  const [activating, setActivating] = useState<string | null>(null)
  const [pending, setPending]       = useState<Record<string, number>>({})

  const load = async () => {
    setLoading(true)
    try {
      const profiles = await api.profiles.list() as Profile[]
      const schedules = await Promise.all(
        profiles.map(p =>
          (api.schedule.get(p.id) as Promise<ScanSchedule | null>).catch(() => null)
        )
      )
      setItems(profiles.map((p, i) => ({ profile: p, schedule: schedules[i] })))
      setPending(
        Object.fromEntries(profiles.map((p, i) => [p.id, schedules[i]?.interval_days ?? 30]))
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleEnable = async (profileId: string, password: string) => {
    await api.schedule.set(profileId, password, pending[profileId] ?? 30)
    setActivating(null)
    await load()
  }

  const handleDisable = async (profileId: string) => {
    await api.schedule.delete(profileId)
    await load()
  }

  const handleIntervalChange = (profileId: string, days: number) => {
    setPending(prev => ({ ...prev, [profileId]: days }))
    const item = items.find(i => i.profile.id === profileId)
    if (item?.schedule?.enabled) setActivating(profileId)
  }

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Calendar size={22} className="text-brand-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Schedules</h1>
          <p className="text-sm text-slate-400 mt-0.5">Automatic scan planning per profile</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-slate-900 border border-dashed border-slate-700 rounded-xl p-12 text-center">
          <p className="text-slate-400 mb-1">No profiles found.</p>
          <p className="text-slate-500 text-sm">
            <Link to="/profiles/new" className="text-brand-400 hover:underline">Create a profile</Link>{' '}
            to set up automatic scanning.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(({ profile, schedule }) => (
            <div
              key={profile.id}
              className={`bg-slate-900 border rounded-xl p-5 ${
                schedule?.enabled ? 'border-brand-800/50' : 'border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-semibold text-white">{profile.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      schedule?.enabled
                        ? 'bg-green-900/40 text-green-400'
                        : 'bg-slate-800 text-slate-500'
                    }`}>
                      {schedule?.enabled ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-400">Every</span>
                    <select
                      value={pending[profile.id] ?? schedule?.interval_days ?? 30}
                      onChange={e => handleIntervalChange(profile.id, Number(e.target.value))}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      {INTERVALS.map(d => (
                        <option key={d} value={d}>{intervalLabel(d)}</option>
                      ))}
                    </select>
                  </div>

                  {schedule?.enabled && (
                    <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
                      <Clock size={10} />
                      Next: {new Date(schedule.next_run).toLocaleDateString()}
                      {schedule.last_run && ` · Last: ${new Date(schedule.last_run).toLocaleDateString()}`}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => schedule?.enabled ? handleDisable(profile.id) : setActivating(profile.id)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      schedule?.enabled ? 'bg-brand-600' : 'bg-slate-700'
                    }`}
                    aria-label={schedule?.enabled ? 'Disable schedule' : 'Enable schedule'}
                  >
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                      schedule?.enabled ? 'translate-x-4' : 'translate-x-1'
                    }`} />
                  </button>
                  <Link
                    to={`/profiles/${profile.id}`}
                    className="text-slate-400 hover:text-white transition"
                    title="View profile"
                  >
                    <ChevronRight size={16} />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activating && (
        <PasswordModal
          title="Enable auto-scan"
          onConfirm={pwd => handleEnable(activating, pwd)}
          onCancel={() => {
            setActivating(null)
            load()
          }}
        />
      )}
    </div>
  )
}
