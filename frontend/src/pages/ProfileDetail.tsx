import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft, Play, CheckCircle2, Clock, AlertTriangle, XCircle, Edit2, Save, X, Calendar } from 'lucide-react'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'
import { hasRank } from '../lib/roles.js'
import { ProfileShares } from '../components/ProfileShares.js'
import { SCAN_INTERVALS, intervalLabel } from '../lib/intervals.js'
import { PasswordModal } from '../components/PasswordModal.js'
import { ScanModal, type ScanOptions } from '../components/ScanModal.js'
import { ScanRow } from '../components/ScanRow.js'
import { BrokerReportPanel } from '../components/BrokerReportPanel.js'
import { StatusBadge } from '../components/StatusBadge.js'
import type { Profile, OptOutRequest, ScanJob, ProfilePII, ScanSchedule } from '../types.js'

const FIELD = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm'
const LABEL = 'block text-sm text-slate-400 mb-1'

export function ProfileDetail() {
  const { id }                        = useParams<{ id: string }>()
  const { user }                      = useAuthStore()
  const [profile, setProfile]         = useState<Profile | null>(null)
  const [optOuts, setOptOuts]         = useState<OptOutRequest[]>([])
  const [jobs, setJobs]               = useState<ScanJob[]>([])
  const [loading, setLoading]         = useState(true)
  const [showScan, setShowScan]             = useState(false)
  const [showDecryptForEdit, setShowDecryptForEdit] = useState(false)
  const [showEdit, setShowEdit]             = useState(false)
  const [editPii, setEditPii]               = useState<ProfilePII | null>(null)
  const [editLabel, setEditLabel]     = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [saving, setSaving]           = useState(false)
  const [decryptErr, setDecryptErr]   = useState('')
  const [error, setError]             = useState('')
  const [selectedOptOut, setSelectedOptOut] = useState<OptOutRequest | null>(null)

  const [schedule, setSchedule]               = useState<ScanSchedule | null>(null)
  const [scheduleInterval, setScheduleInterval] = useState(30)
  const [showSchedulePwd, setShowSchedulePwd]   = useState(false)
  const [scheduleSaving, setScheduleSaving]     = useState(false)

  const load = async () => {
    if (!id) return
    try {
      const [p, oo, scans, sched] = await Promise.all([
        api.profiles.get(id) as Promise<Profile>,
        api.optOuts.forProfile(id).catch(() => []) as Promise<OptOutRequest[]>,
        (api.profiles.scans(id) as Promise<ScanJob[]>).catch(() => [] as ScanJob[]),
        (api.schedule.get(id) as Promise<ScanSchedule | null>).catch(() => null),
      ])
      setProfile(p)
      setOptOuts(oo)
      setJobs(scans)
      if (sched) {
        setSchedule(sched)
        setScheduleInterval(sched.interval_days)
      } else {
        setSchedule(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  const handleScan = async (password: string, opts: ScanOptions) => {
    if (!id) return
    await api.scans.create(id, password, opts.email, opts.aliasId, opts.audience, opts.brokerIds, opts.countries)
    setShowScan(false)
    load()
  }

  const handleDecryptForEdit = async (password: string) => {
    if (!id) return
    setDecryptErr('')
    const result = await api.profiles.decrypt(id, password) as { pii: ProfilePII; label: string }
    setEditPii(result.pii)
    setEditLabel(profile?.label ?? '')
    setEditPassword(password)
    setShowEdit(true)
  }

  const handleSaveEdit = async () => {
    if (!id || !editPii) return
    setSaving(true)
    try {
      await api.profiles.update(id, editPassword, editPii, editLabel)
      setShowEdit(false)
      setEditPii(null)
      load()
    } catch (e) {
      setDecryptErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleEnableSchedule = async (password: string) => {
    if (!id) return
    setScheduleSaving(true)
    try {
      await api.schedule.set(id, password, scheduleInterval)
      const sched = await api.schedule.get(id) as ScanSchedule
      setSchedule(sched)
      setScheduleInterval(sched.interval_days)
      setShowSchedulePwd(false)
    } finally {
      setScheduleSaving(false)
    }
  }

  const handleDisableSchedule = async () => {
    if (!id) return
    await api.schedule.delete(id)
    setSchedule(null)
  }

  const handleIntervalChange = (days: number) => {
    setScheduleInterval(days)
    if (schedule?.enabled) setShowSchedulePwd(true)
  }

  const activeJob = jobs.find(j => j.status === 'running' || j.status === 'queued')
  const counts = {
    confirmed:      optOuts.filter(o => o.status === 'confirmed' || o.status === 'already_removed').length,
    awaiting_email: optOuts.filter(o => o.status === 'awaiting_email').length,
    manual:         optOuts.filter(o => o.status === 'manual').length,
    failed:         optOuts.filter(o => o.status === 'failed').length,
  }

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>
  if (error)   return <div className="p-8 text-red-400">{error}</div>
  if (!profile) return <div className="p-8 text-slate-400">Profile not found.</div>

  const isOwnerOrAdmin = user?.role === 'admin' || profile.user_id === user?.id
  const canScan        = isOwnerOrAdmin || hasRank(user?.role, 'editor')

  if (showEdit && editPii) {
    return (
      <div className="p-8 max-w-2xl">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => { setShowEdit(false); setEditPii(null) }} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
          <h1 className="text-2xl font-bold text-white">Edit profile</h1>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          {decryptErr && <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">{decryptErr}</div>}

          <div><label className={LABEL}>Profile label</label>
            <input type="text" value={editLabel} onChange={e => setEditLabel(e.target.value)} className={FIELD} /></div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={LABEL}>First name</label>
              <input type="text" value={editPii.firstName} onChange={e => setEditPii({...editPii, firstName: e.target.value})} className={FIELD} /></div>
            <div><label className={LABEL}>Last name</label>
              <input type="text" value={editPii.lastName} onChange={e => setEditPii({...editPii, lastName: e.target.value})} className={FIELD} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LABEL}>Date of birth</label>
              <input type="date" value={editPii.dob} onChange={e => setEditPii({...editPii, dob: e.target.value})} className={FIELD} /></div>
            <div><label className={LABEL}>Phone</label>
              <input type="tel" value={editPii.phone ?? ''} onChange={e => setEditPii({...editPii, phone: e.target.value || undefined})} className={FIELD} /></div>
          </div>
          <div><label className={LABEL}>Email for opt-out confirmations</label>
            <input type="email" value={editPii.email ?? ''} onChange={e => setEditPii({...editPii, email: e.target.value || undefined})} className={FIELD} placeholder="confirmations@example.com" /></div>

          <hr className="border-slate-700" />
          <h3 className="text-sm font-medium text-slate-300">
            Professionnel <span className="text-slate-500 font-normal">(optionnel — pour les courtiers B2B)</span>
          </h3>
          <div><label className={LABEL}>Raison sociale</label>
            <input type="text" value={editPii.company?.name ?? ''}
              onChange={e => { const v = e.target.value; setEditPii(prev => prev && ({...prev, company: v ? {...prev.company, name: v} : undefined})) }}
              className={FIELD} placeholder="ACME SARL" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LABEL}>SIREN <span className="text-slate-500">(9 chiffres)</span></label>
              <input type="text" inputMode="numeric" value={editPii.company?.siren ?? ''}
                disabled={!editPii.company?.name}
                onChange={e => { const v = e.target.value; setEditPii(prev => prev?.company ? {...prev, company: {...prev.company, siren: v || undefined}} : prev) }}
                className={`${FIELD} disabled:opacity-40`} placeholder="123456789" /></div>
            <div><label className={LABEL}>SIRET <span className="text-slate-500">(14 chiffres)</span></label>
              <input type="text" inputMode="numeric" value={editPii.company?.siret ?? ''}
                disabled={!editPii.company?.name}
                onChange={e => { const v = e.target.value; setEditPii(prev => prev?.company ? {...prev, company: {...prev.company, siret: v || undefined}} : prev) }}
                className={`${FIELD} disabled:opacity-40`} placeholder="12345678900012" /></div>
          </div>
          <div><label className={LABEL}>Forme juridique</label>
            <input type="text" value={editPii.company?.legalForm ?? ''}
              disabled={!editPii.company?.name}
              onChange={e => { const v = e.target.value; setEditPii(prev => prev?.company ? {...prev, company: {...prev.company, legalForm: v || undefined}} : prev) }}
              className={`${FIELD} disabled:opacity-40`} placeholder="SARL, SAS, EI…" /></div>

          <hr className="border-slate-700" />
          <h3 className="text-sm font-medium text-slate-300">Current address</h3>
          <div><label className={LABEL}>Street</label>
            <input type="text" value={editPii.currentAddress.street} onChange={e => setEditPii({...editPii, currentAddress: {...editPii.currentAddress, street: e.target.value}})} className={FIELD} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LABEL}>City</label>
              <input type="text" value={editPii.currentAddress.city} onChange={e => setEditPii({...editPii, currentAddress: {...editPii.currentAddress, city: e.target.value}})} className={FIELD} /></div>
            <div><label className={LABEL}>State</label>
              <input type="text" value={editPii.currentAddress.state ?? ''} onChange={e => setEditPii({...editPii, currentAddress: {...editPii.currentAddress, state: e.target.value || undefined}})} className={FIELD} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LABEL}>ZIP</label>
              <input type="text" value={editPii.currentAddress.zip ?? ''} onChange={e => setEditPii({...editPii, currentAddress: {...editPii.currentAddress, zip: e.target.value || undefined}})} className={FIELD} /></div>
            <div><label className={LABEL}>Country</label>
              <select value={editPii.currentAddress.country} onChange={e => setEditPii({...editPii, currentAddress: {...editPii.currentAddress, country: e.target.value}})} className={FIELD}>
                <option value="US">United States</option><option value="FR">France</option><option value="GB">United Kingdom</option>
                <option value="CA">Canada</option><option value="DE">Germany</option><option value="AU">Australia</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => { setShowEdit(false); setEditPii(null) }}
              className="flex-1 px-4 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-800 transition text-sm">
              Cancel
            </button>
            <button onClick={handleSaveEdit} disabled={saving}
              className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center justify-center gap-2">
              <Save size={14} />
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/profiles" className="text-slate-400 hover:text-white transition">
          <ChevronLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{profile.label}</h1>
          <p className="text-xs text-slate-500 mt-0.5">Created {new Date(profile.created_at).toLocaleDateString()}</p>
        </div>
        {isOwnerOrAdmin && (
          <button
            onClick={() => setShowDecryptForEdit(true)}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-sm transition">
            <Edit2 size={14} /> Edit
          </button>
        )}
        {canScan && (
          <button
            onClick={() => setShowScan(true)}
            disabled={!!activeJob}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-40">
            <Play size={14} />
            {activeJob ? 'Scan in progress…' : 'Scan now'}
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1"><CheckCircle2 size={16} className="text-green-400" /><span className="text-xs text-slate-400">Confirmed</span></div>
          <p className="text-2xl font-bold text-white">{counts.confirmed}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1"><Clock size={16} className="text-orange-400" /><span className="text-xs text-slate-400">Email pending</span></div>
          <p className="text-2xl font-bold text-white">{counts.awaiting_email}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1"><AlertTriangle size={16} className="text-yellow-400" /><span className="text-xs text-slate-400">Manual</span></div>
          <p className="text-2xl font-bold text-white">{counts.manual}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1"><XCircle size={16} className="text-red-400" /><span className="text-xs text-slate-400">Failed</span></div>
          <p className="text-2xl font-bold text-white">{counts.failed}</p>
        </div>
      </div>

      {/* Auto-scan schedule */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Calendar size={14} /> Auto-scan schedule
          </h2>
          <button
            onClick={() => schedule?.enabled ? handleDisableSchedule() : setShowSchedulePwd(true)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              schedule?.enabled ? 'bg-brand-600' : 'bg-slate-700'
            }`}
            aria-label={schedule?.enabled ? 'Disable schedule' : 'Enable schedule'}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
              schedule?.enabled ? 'translate-x-4' : 'translate-x-1'
            }`} />
          </button>
        </div>
        {schedule?.enabled ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">Scan every</span>
              <select
                value={scheduleInterval}
                onChange={e => handleIntervalChange(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {SCAN_INTERVALS.map(d => (
                  <option key={d} value={d}>{intervalLabel(d)}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-500">
              Next scan: {new Date(schedule.next_run).toLocaleDateString()}
              {schedule.last_run && ` · Last: ${new Date(schedule.last_run).toLocaleDateString()}`}
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Automatically run a scan at regular intervals. Requires your master password to activate.
          </p>
        )}
      </div>

      {/* Sharing — owner/admin only */}
      {isOwnerOrAdmin && id && <ProfileShares profileId={id} />}

      {/* Scan history — expandable with live progress */}
      {jobs.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Scan history</h2>
          <div className="space-y-2">
            {jobs.slice(0, 5).map(job => (
              <ScanRow
                key={job.id}
                job={job}
                onAliasDeleted={id => setJobs(prev => prev.map(j =>
                  j.id === id ? { ...j, simplelogin_alias_id: null, confirmation_email: null } : j
                ))}
                onSelectOptOut={oo => setSelectedOptOut(prev => prev?.id === oo.id ? null : oo)}
              />
            ))}
          </div>
        </div>
      )}

      {jobs.length === 0 && (
        <div className="bg-slate-900 border border-dashed border-slate-700 rounded-xl p-12 text-center">
          <p className="text-slate-400 mb-2">No scans yet.</p>
          <p className="text-slate-500 text-sm">Start a scan to submit opt-out requests to all brokers.</p>
        </div>
      )}

      {optOuts.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Opt-out status
          </h2>
          <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden">
            {[...optOuts]
              .sort((a, b) => {
                const order = ['failed', 'manual', 'awaiting_email', 'submitted', 'pending', 'confirmed', 'already_removed']
                return order.indexOf(a.status) - order.indexOf(b.status)
              })
              .map(oo => (
                <button
                  key={oo.id}
                  onClick={() => setSelectedOptOut(prev => prev?.id === oo.id ? null : oo)}
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
                  <StatusBadge status={oo.status} />
                </button>
              ))}
          </div>
        </div>
      )}

      <BrokerReportPanel optOut={selectedOptOut} onClose={() => setSelectedOptOut(null)} />

      {showScan && (
        <ScanModal
          profileLabel={profile.label}
          profileId={profile.id}
          defaultRedirectEmail={profile.redirect_email}
          onConfirm={handleScan}
          onCancel={() => setShowScan(false)}
        />
      )}
      {showDecryptForEdit && (
        <PasswordModal
          title="Enter password to edit profile"
          onConfirm={async (pwd) => { setShowDecryptForEdit(false); await handleDecryptForEdit(pwd) }}
          onCancel={() => { setShowDecryptForEdit(false); setDecryptErr('') }}
        />
      )}
      {showSchedulePwd && (
        <PasswordModal
          title={schedule?.enabled ? 'Update schedule' : 'Enable auto-scan'}
          onConfirm={handleEnableSchedule}
          onCancel={() => {
            setShowSchedulePwd(false)
            setScheduleInterval(schedule?.interval_days ?? 30)
          }}
        />
      )}
    </div>
  )
}
