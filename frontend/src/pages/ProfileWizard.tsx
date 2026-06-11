import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronRight, ChevronLeft, User, MapPin, Mail, Eye } from 'lucide-react'
import { api } from '../api/client.js'
import type { ProfilePII } from '../types.js'

type Step = 1 | 2 | 3 | 4

const STEPS = [
  { num: 1 as Step, icon: User,   label: 'Identity' },
  { num: 2 as Step, icon: MapPin, label: 'Addresses' },
  { num: 3 as Step, icon: Mail,   label: 'Email config' },
  { num: 4 as Step, icon: Eye,    label: 'Review' },
]

const FIELD = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm'
const LABEL = 'block text-sm text-slate-400 mb-1'

export function ProfileWizard() {
  const navigate = useNavigate()
  const [step, setStep]         = useState<Step>(1)
  const [label, setLabel]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [saving, setSaving]     = useState(false)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [dob, setDob]             = useState('')
  const [email, setEmail]         = useState('')
  const [phone, setPhone]         = useState('')
  const [alias, setAlias]         = useState('')

  const [street, setStreet]   = useState('')
  const [city, setCity]       = useState('')
  const [state, setState]     = useState('')
  const [zip, setZip]         = useState('')
  const [country, setCountry] = useState('US')

  const [companyName, setCompanyName] = useState('')
  const [siren, setSiren]             = useState('')
  const [siret, setSiret]             = useState('')
  const [legalForm, setLegalForm]     = useState('')

  const pii: ProfilePII = {
    firstName, lastName, dob,
    email:   email || undefined,
    phone:   phone || undefined,
    aliases: alias ? [alias] : undefined,
    currentAddress: { street, city, state: state || undefined, zip: zip || undefined, country },
    company: companyName
      ? { name: companyName, siren: siren || undefined, siret: siret || undefined, legalForm: legalForm || undefined }
      : undefined,
  }

  const handleNext = () => {
    if (step === 1) {
      if (!firstName || !lastName || !dob || !label) {
        setError('Please fill in all required fields.'); return
      }
    }
    if (step === 2 && (!street || !city || !country)) {
      setError('Street, city and country are required.'); return
    }
    setError('')
    setStep((step + 1) as Step)
  }

  const handleSubmit = async () => {
    if (!password) { setError('Password is required to encrypt your data.'); return }
    setSaving(true)
    setError('')
    try {
      await api.profiles.create(label, password, pii)
      navigate('/profiles', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile')
      setSaving(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">New profile</h1>

      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.num} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition ${
              step > s.num ? 'bg-green-600 text-white' :
              step === s.num ? 'bg-brand-600 text-white' :
              'bg-slate-800 text-slate-500'
            }`}>
              {step > s.num ? <Check size={14} /> : s.num}
            </div>
            <span className={`text-sm ${step === s.num ? 'text-white' : 'text-slate-500'}`}>{s.label}</span>
            {i < STEPS.length - 1 && <div className="w-8 h-px bg-slate-700 mx-1" />}
          </div>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        {error && <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">{error}</div>}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400 bg-slate-800 border border-slate-700 rounded-lg p-3">
              🔒 These details will be encrypted with your master password and never stored in plaintext.
            </p>
            <div>
              <label className={LABEL}>Profile label (not encrypted)</label>
              <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Alice Dupont" className={FIELD} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={LABEL}>First name *</label><input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} className={FIELD} required /></div>
              <div><label className={LABEL}>Last name *</label><input type="text" value={lastName} onChange={e => setLastName(e.target.value)} className={FIELD} required /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={LABEL}>Date of birth *</label><input type="date" value={dob} onChange={e => setDob(e.target.value)} className={FIELD} required /></div>
              <div><label className={LABEL}>Phone (optional)</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={FIELD} /></div>
            </div>
            <div>
              <label className={LABEL}>Email for opt-out confirmations</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={FIELD} placeholder="confirmations@example.com" />
              <p className="text-xs text-slate-500 mt-1">Used when submitting opt-out forms. Confirmation emails will be sent here.</p>
            </div>
            <div><label className={LABEL}>Alias / maiden name (optional)</label><input type="text" value={alias} onChange={e => setAlias(e.target.value)} className={FIELD} /></div>

            <hr className="border-slate-700" />
            <p className="text-sm text-slate-300 font-medium">
              Professionnel <span className="text-slate-500 font-normal">(optionnel — pour les courtiers B2B comme Altares)</span>
            </p>
            <div><label className={LABEL}>Raison sociale</label>
              <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} className={FIELD} placeholder="ACME SARL" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={LABEL}>SIREN <span className="text-slate-500">(9 chiffres)</span></label>
                <input type="text" inputMode="numeric" value={siren} disabled={!companyName} onChange={e => setSiren(e.target.value)} className={`${FIELD} disabled:opacity-40`} placeholder="123456789" /></div>
              <div><label className={LABEL}>SIRET <span className="text-slate-500">(14 chiffres)</span></label>
                <input type="text" inputMode="numeric" value={siret} disabled={!companyName} onChange={e => setSiret(e.target.value)} className={`${FIELD} disabled:opacity-40`} placeholder="12345678900012" /></div>
            </div>
            <div><label className={LABEL}>Forme juridique</label>
              <input type="text" value={legalForm} disabled={!companyName} onChange={e => setLegalForm(e.target.value)} className={`${FIELD} disabled:opacity-40`} placeholder="SARL, SAS, EI…" /></div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="font-medium text-white mb-2">Current address</h3>
            <div><label className={LABEL}>Street *</label><input type="text" value={street} onChange={e => setStreet(e.target.value)} className={FIELD} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={LABEL}>City *</label><input type="text" value={city} onChange={e => setCity(e.target.value)} className={FIELD} required /></div>
              <div><label className={LABEL}>State</label><input type="text" value={state} onChange={e => setState(e.target.value)} placeholder="CA" className={FIELD} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={LABEL}>ZIP</label><input type="text" value={zip} onChange={e => setZip(e.target.value)} className={FIELD} /></div>
              <div><label className={LABEL}>Country *</label>
                <select value={country} onChange={e => setCountry(e.target.value)} className={FIELD}>
                  <option value="US">United States</option>
                  <option value="FR">France</option>
                  <option value="GB">United Kingdom</option>
                  <option value="CA">Canada</option>
                  <option value="DE">Germany</option>
                  <option value="AU">Australia</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300 font-medium">Email confirmation (optional)</p>
            <p className="text-sm text-slate-400">
              Many data brokers send a confirmation email when you opt out. Nyx can automatically detect and click these links.
            </p>
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center text-slate-400 text-sm">
              Email configuration can be set up later from your profile settings.
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h3 className="font-medium text-white">Review</h3>
            <div className="bg-slate-800 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">Label</span><span className="text-white">{label}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Name</span><span className="text-white">{firstName} {lastName}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">DOB</span><span className="text-white">{dob}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">City</span><span className="text-white">{city}, {country}</span></div>
            </div>

            <div>
              <label className={LABEL}>Master password to encrypt</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className={FIELD} placeholder="Your Nyx password" required autoFocus />
            </div>
          </div>
        )}

        <div className="flex justify-between mt-6 pt-4 border-t border-slate-800">
          <button onClick={() => step > 1 ? setStep((step - 1) as Step) : navigate('/profiles')}
            className="flex items-center gap-1.5 px-4 py-2 text-slate-400 hover:text-white transition text-sm">
            <ChevronLeft size={16} />
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          {step < 4 ? (
            <button onClick={handleNext}
              className="flex items-center gap-1.5 px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition">
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50">
              {saving ? 'Saving…' : <><Check size={16} /> Create profile</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
