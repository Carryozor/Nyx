# Logo + Scheduling UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer l'icône Moon par un logo SVG custom (œil mystique + texte gradient) et ajouter l'UI de planification automatique des scans dans ProfileDetail et une page Schedules dédiée.

**Architecture:** Trois tâches frontend indépendantes — (1) composant NyxLogo SVG + Sidebar + favicon, (2) section Schedule dans ProfileDetail avec toggle et PasswordModal, (3) page Schedules globale + route + sidebar link. Le backend scheduling est 100% opérationnel (pas de modifications backend).

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vite, Vitest + @testing-library/react, Lucide React

---

## Fichiers touchés

| Fichier | Action |
|---|---|
| `frontend/src/components/NyxLogo.tsx` | Créer |
| `frontend/src/components/Sidebar.tsx` | Modifier |
| `frontend/index.html` | Modifier |
| `frontend/src/pages/ProfileDetail.tsx` | Modifier |
| `frontend/src/pages/Schedules.tsx` | Créer |
| `frontend/src/App.tsx` | Modifier |
| `frontend/src/__tests__/NyxLogo.test.tsx` | Créer |
| `frontend/src/__tests__/Schedules.test.tsx` | Créer |

---

## Task 1 — Composant NyxLogo + Sidebar + favicon

**Files:**
- Create: `frontend/src/components/NyxLogo.tsx`
- Create: `frontend/src/__tests__/NyxLogo.test.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/index.html`

- [ ] **Écrire le test (RED)**

Créer `frontend/src/__tests__/NyxLogo.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { NyxLogo } from '../components/NyxLogo.js'

describe('NyxLogo', () => {
  it('renders an SVG without crashing', () => {
    const { container } = render(<NyxLogo />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('uses default size 32', () => {
    const { container } = render(<NyxLogo />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('32')
    expect(svg.getAttribute('height')).toBe('32')
  })

  it('accepts custom size', () => {
    const { container } = render(<NyxLogo size={48} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('48')
    expect(svg.getAttribute('height')).toBe('48')
  })

  it('generates unique gradient IDs when rendered multiple times', () => {
    const { container: c1 } = render(<NyxLogo />)
    const { container: c2 } = render(<NyxLogo />)
    const id1 = c1.querySelector('linearGradient')?.id
    const id2 = c2.querySelector('linearGradient')?.id
    expect(id1).toBeTruthy()
    expect(id2).toBeTruthy()
    expect(id1).not.toBe(id2)
  })
})
```

- [ ] **Vérifier que les tests ÉCHOUENT**

```bash
cd /opt/claude/nyx/frontend && npm run test 2>&1 | tail -8
```
Attendu : FAIL — `NyxLogo` not found.

- [ ] **Créer `frontend/src/components/NyxLogo.tsx`**

```tsx
import { useId } from 'react'

interface NyxLogoProps {
  size?: number
}

export function NyxLogo({ size = 32 }: NyxLogoProps) {
  const uid   = useId()
  const gradId = `eye-grad-${uid}`
  const irisId = `iris-grad-${uid}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Nyx logo"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0.5" x2="1" y2="0.5">
          <stop offset="0%"   stopColor="#4f46e5" />
          <stop offset="50%"  stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
        <radialGradient id={irisId} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#4338ca" />
        </radialGradient>
      </defs>

      {/* Background */}
      <rect width="64" height="64" rx="12" fill="#030712" />

      {/* Eye halo */}
      <ellipse cx="32" cy="32" rx="24" ry="14" fill="#1e1b4b" opacity="0.4" />

      {/* Eye contour */}
      <path
        d="M8 32C8 32 18 16 32 16C46 16 56 32 56 32C56 32 46 48 32 48C18 48 8 32 8 32Z"
        stroke={`url(#${gradId})`}
        strokeWidth="1.5"
        fill="none"
      />

      {/* Iris */}
      <circle cx="32" cy="32" r="9" fill={`url(#${irisId})`} />

      {/* Pupil */}
      <circle cx="32" cy="32" r="4" fill="#030712" />

      {/* Specular highlight */}
      <circle cx="35" cy="29" r="1.5" fill="white" opacity="0.7" />

      {/* Corner glow dots */}
      <circle cx="9"  cy="32" r="1.5" fill="#818cf8" opacity="0.5" />
      <circle cx="55" cy="32" r="1.5" fill="#818cf8" opacity="0.5" />
    </svg>
  )
}
```

- [ ] **Lancer les tests (GREEN)**

```bash
cd /opt/claude/nyx/frontend && npm run test 2>&1 | grep -E "Tests |FAIL"
```
Attendu : tous passent.

- [ ] **Modifier `frontend/src/components/Sidebar.tsx`**

Lis le fichier actuel. Remplace :

```tsx
import { LayoutDashboard, Users, Shield, Clock, BookOpen, Settings, LogOut, Moon } from 'lucide-react'
```
par :
```tsx
import { LayoutDashboard, Users, Shield, Clock, Calendar, BookOpen, Settings, LogOut } from 'lucide-react'
import { NyxLogo } from './NyxLogo.js'
```

Remplace le bloc header :
```tsx
      <div className="px-4 py-5 flex items-center gap-3 border-b border-slate-800">
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
          <Moon size={16} className="text-white" />
        </div>
        <span className="text-white font-semibold tracking-wide">Nyx</span>
      </div>
```
par :
```tsx
      <div className="px-4 py-5 flex items-center gap-3 border-b border-slate-800">
        <NyxLogo size={32} />
        <span style={{
          fontFamily: "'Outfit', sans-serif",
          fontWeight: 700,
          fontSize: '15px',
          background: 'linear-gradient(90deg, #818cf8, #c4b5fd)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          letterSpacing: '.04em',
        }}>NYX</span>
      </div>
```

Ajoute le lien Schedules dans `adminLinks` (entre Brokers et History) :
```tsx
  const adminLinks = [
    { to: '/',           icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/profiles',   icon: Users,           label: 'Profiles'  },
    { to: '/brokers',    icon: Shield,          label: 'Brokers'   },
    { to: '/schedules',  icon: Calendar,        label: 'Schedules' },
    { to: '/history',    icon: Clock,           label: 'History'   },
    { to: '/guide',      icon: BookOpen,        label: 'Manual Guide' },
    { to: '/settings',   icon: Settings,        label: 'Settings'  },
  ]
```

- [ ] **Modifier `frontend/index.html`**

Remplace le `<link rel="icon">` existant par :
```html
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='%23030712'/><path d='M8 32C8 32 18 16 32 16C46 16 56 32 56 32C56 32 46 48 32 48C18 48 8 32 8 32Z' stroke='%23818cf8' stroke-width='2' fill='none'/><circle cx='32' cy='32' r='10' fill='%235b21b6'/><circle cx='32' cy='32' r='4.5' fill='%23030712'/><circle cx='35' cy='29' r='2' fill='white' opacity='.6'/></svg>" />
```

Ajoute avant `</head>` la Google Font Outfit :
```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@700&display=swap" rel="stylesheet">
```

- [ ] **Build TypeScript**

```bash
cd /opt/claude/nyx/frontend && npm run build 2>&1 | tail -5
```
Attendu : aucune erreur.

- [ ] **Commit**

```bash
cd /opt/claude/nyx && git add frontend/src/components/NyxLogo.tsx \
  frontend/src/components/Sidebar.tsx \
  frontend/index.html \
  frontend/src/__tests__/NyxLogo.test.tsx
git commit -m "feat: custom NyxLogo SVG component + Outfit gradient text + eye favicon"
```

---

## Task 2 — Section Schedule dans ProfileDetail

**Files:**
- Modify: `frontend/src/pages/ProfileDetail.tsx`

- [ ] **Lire le fichier actuel**

```bash
wc -l /opt/claude/nyx/frontend/src/pages/ProfileDetail.tsx
```

- [ ] **Ajouter l'import Calendar et le type ScanSchedule**

En haut de `ProfileDetail.tsx`, ajouter `Calendar` dans les imports lucide :
```tsx
import { ChevronLeft, Play, CheckCircle2, Clock, AlertTriangle, XCircle, Edit2, Save, X, Calendar } from 'lucide-react'
```

Ajouter `ScanSchedule` dans les imports types :
```tsx
import type { Profile, OptOutRequest, ScanJob, ProfilePII, ScanSchedule } from '../types.js'
```

- [ ] **Ajouter les états schedule**

Après `const [selectedOptOut, setSelectedOptOut] = useState<OptOutRequest | null>(null)` ajouter :

```tsx
  const [schedule, setSchedule]         = useState<ScanSchedule | null>(null)
  const [scheduleInterval, setScheduleInterval] = useState(30)
  const [showSchedulePwd, setShowSchedulePwd]   = useState(false)
  const [scheduleSaving, setScheduleSaving]     = useState(false)
```

- [ ] **Charger le schedule dans `load()`**

Dans la fonction `load`, ajouter l'appel schedule dans le `Promise.all` :

```typescript
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
```

- [ ] **Ajouter les handlers schedule**

Après `handleSaveEdit`, ajouter :

```typescript
  const handleEnableSchedule = async (password: string) => {
    if (!id) return
    setScheduleSaving(true)
    try {
      await api.schedule.set(id, password, scheduleInterval)
      const sched = await api.schedule.get(id) as ScanSchedule
      setSchedule(sched)
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
```

- [ ] **Ajouter la section Schedule dans le JSX**

Dans le return principal (après le bloc KPIs `mb-8`, avant `{/* Scan history */}`), insérer :

```tsx
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
                {[7, 14, 30, 60, 90].map(d => (
                  <option key={d} value={d}>{d} days</option>
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
```

- [ ] **Ajouter la PasswordModal pour le schedule**

Dans les modals en bas du JSX (avant `</div>` final), ajouter :

```tsx
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
```

- [ ] **Build TypeScript**

```bash
cd /opt/claude/nyx/frontend && npm run build 2>&1 | tail -5
```

- [ ] **Lancer les tests frontend**

```bash
cd /opt/claude/nyx/frontend && npm run test 2>&1 | grep -E "Tests |FAIL"
```
Attendu : tous passent.

- [ ] **Commit**

```bash
cd /opt/claude/nyx && git add frontend/src/pages/ProfileDetail.tsx
git commit -m "feat: auto-scan schedule section in ProfileDetail with toggle and interval selector"
```

---

## Task 3 — Page Schedules + Route + Sidebar link

**Files:**
- Create: `frontend/src/pages/Schedules.tsx`
- Create: `frontend/src/__tests__/Schedules.test.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Écrire le test (RED)**

Créer `frontend/src/__tests__/Schedules.test.tsx` :

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Schedules } from '../pages/Schedules.js'

vi.mock('../api/client.js', () => ({
  api: {
    profiles: {
      list: vi.fn().mockResolvedValue([]),
    },
    schedule: {
      get:    vi.fn().mockResolvedValue(null),
      set:    vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  },
}))

function renderSchedules() {
  return render(
    <MemoryRouter>
      <Schedules />
    </MemoryRouter>
  )
}

describe('Schedules page', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('shows empty state when no profiles', async () => {
    renderSchedules()
    await waitFor(() => {
      expect(screen.getByText(/no profiles/i)).toBeInTheDocument()
    })
  })

  it('shows profile cards when profiles exist', async () => {
    const { api } = await import('../api/client.js')
    vi.mocked(api.profiles.list).mockResolvedValue([
      { id: 'p1', label: 'Alice Dupont', user_id: 'u1', created_at: '2026-01-01' },
    ] as any)

    renderSchedules()
    await waitFor(() => {
      expect(screen.getByText('Alice Dupont')).toBeInTheDocument()
    })
  })

  it('shows Inactive badge when no schedule', async () => {
    const { api } = await import('../api/client.js')
    vi.mocked(api.profiles.list).mockResolvedValue([
      { id: 'p1', label: 'Alice Dupont', user_id: 'u1', created_at: '2026-01-01' },
    ] as any)
    vi.mocked(api.schedule.get).mockResolvedValue(null)

    renderSchedules()
    await waitFor(() => {
      expect(screen.getByText(/inactive/i)).toBeInTheDocument()
    })
  })

  it('shows next scan date when schedule is active', async () => {
    const { api } = await import('../api/client.js')
    vi.mocked(api.profiles.list).mockResolvedValue([
      { id: 'p1', label: 'Alice Dupont', user_id: 'u1', created_at: '2026-01-01' },
    ] as any)
    vi.mocked(api.schedule.get).mockResolvedValue({
      id: 's1', profile_id: 'p1', interval_days: 30,
      next_run: '2026-07-05T00:00:00.000Z',
      last_run: null, enabled: true,
    } as any)

    renderSchedules()
    await waitFor(() => {
      expect(screen.getByText(/30 days/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Vérifier que les tests ÉCHOUENT**

```bash
cd /opt/claude/nyx/frontend && npm run test 2>&1 | tail -8
```
Attendu : FAIL — `Schedules` not found.

- [ ] **Créer `frontend/src/pages/Schedules.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, ChevronRight, CheckCircle2, Clock } from 'lucide-react'
import { api } from '../api/client.js'
import { PasswordModal } from '../components/PasswordModal.js'
import type { Profile, ScanSchedule } from '../types.js'

interface ProfileWithSchedule {
  profile:  Profile
  schedule: ScanSchedule | null
}

const INTERVALS = [7, 14, 30, 60, 90]

export function Schedules() {
  const [items, setItems]         = useState<ProfileWithSchedule[]>([])
  const [loading, setLoading]     = useState(true)
  const [activating, setActivating] = useState<string | null>(null)   // profile id being activated
  const [interval, setInterval]   = useState<Record<string, number>>({}) // pending interval per profile

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
      setInterval(
        Object.fromEntries(
          profiles.map((p, i) => [p.id, schedules[i]?.interval_days ?? 30])
        )
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleEnable = async (profileId: string, password: string) => {
    await api.schedule.set(profileId, password, interval[profileId] ?? 30)
    setActivating(null)
    await load()
  }

  const handleDisable = async (profileId: string) => {
    await api.schedule.delete(profileId)
    await load()
  }

  const handleIntervalChange = (profileId: string, days: number) => {
    setInterval(prev => ({ ...prev, [profileId]: days }))
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
            <Link to="/profiles/new" className="text-brand-400 hover:underline">Create a profile</Link> to set up automatic scanning.
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

                  {schedule?.enabled ? (
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-sm text-slate-400">Every</span>
                      <select
                        value={interval[profile.id] ?? schedule.interval_days}
                        onChange={e => handleIntervalChange(profile.id, Number(e.target.value))}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        {INTERVALS.map(d => (
                          <option key={d} value={d}>{d} days</option>
                        ))}
                      </select>
                      <span className="text-sm text-slate-400">·</span>
                      <span className="text-xs text-brand-400 flex items-center gap-1">
                        <Clock size={11} />
                        Next: {new Date(schedule.next_run).toLocaleDateString()}
                      </span>
                      {schedule.last_run && (
                        <span className="text-xs text-slate-500">
                          Last: {new Date(schedule.last_run).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-slate-400">Every</span>
                      <select
                        value={interval[profile.id] ?? 30}
                        onChange={e => setInterval(prev => ({ ...prev, [profile.id]: Number(e.target.value) }))}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        {INTERVALS.map(d => (
                          <option key={d} value={d}>{d} days</option>
                        ))}
                      </select>
                    </div>
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
```

- [ ] **Lancer les tests (GREEN)**

```bash
cd /opt/claude/nyx/frontend && npm run test 2>&1 | grep -E "Tests |FAIL"
```
Attendu : tous passent.

- [ ] **Modifier `frontend/src/App.tsx`** — ajouter la route `/schedules`

Ajouter l'import :
```tsx
import { Schedules } from './pages/Schedules.js'
```

Ajouter la route dans le bloc `<Routes>` intérieur (entre Brokers et History) :
```tsx
              <Route path="schedules"   element={<Schedules />} />
```

- [ ] **Build TypeScript**

```bash
cd /opt/claude/nyx/frontend && npm run build 2>&1 | tail -5
```
Attendu : aucune erreur TypeScript.

- [ ] **Lancer tous les tests frontend**

```bash
cd /opt/claude/nyx/frontend && npm run test 2>&1 | grep -E "Tests |FAIL"
```
Attendu : tous passent.

- [ ] **Commit**

```bash
cd /opt/claude/nyx && git add frontend/src/pages/Schedules.tsx \
  frontend/src/__tests__/Schedules.test.tsx \
  frontend/src/App.tsx
git commit -m "feat: Schedules page with per-profile toggle and interval selector"
```

---

## Task 4 — Build frontend + rebuild Docker

- [ ] **Build frontend production**

```bash
cd /opt/claude/nyx/frontend && npm run build 2>&1 | tail -5
```

- [ ] **Rebuild nyx-api (sert le frontend)**

```bash
cd /opt/osint && docker compose build nyx-api 2>&1 | tail -3 && docker compose up -d nyx-api 2>&1 | tail -3
```

- [ ] **Vérifier que l'app tourne**

```bash
sleep 8 && curl -s http://localhost:3000/health
```
Attendu : `{"status":"ok","version":"1.0.0"}`

- [ ] **Commit**

```bash
cd /opt/claude/nyx && git add frontend/dist 2>/dev/null || true
git commit -m "chore: rebuild frontend dist with logo + schedules"
```

---

## Checklist de couverture spec

| Exigence spec | Tâche |
|---|---|
| `NyxLogo` SVG avec gradient eye A2 | Task 1 |
| IDs gradient uniques par instance | Task 1 (useId) |
| Sidebar: NyxLogo + texte Outfit gradient | Task 1 |
| Favicon eye SVG | Task 1 |
| Google Font Outfit dans index.html | Task 1 |
| Sidebar: lien Schedules avec icône Calendar | Task 1 |
| Schedule toggle dans ProfileDetail | Task 2 |
| Sélecteur 7/14/30/60/90 jours | Task 2 |
| PasswordModal pour activer/modifier | Task 2 |
| Désactivation sans mot de passe | Task 2 |
| Next scan + last scan affiché | Task 2 |
| Page Schedules avec tous les profils | Task 3 |
| Badge Active/Inactive | Task 3 |
| Toggle + interval par profil | Task 3 |
| Lien vers ProfileDetail | Task 3 |
| État vide (no profiles) | Task 3 |
| Route `/schedules` dans App.tsx | Task 3 |
