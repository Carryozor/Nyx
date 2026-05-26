import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './store/auth.js'
import { Layout }       from './components/Layout.js'
import { Login }        from './pages/Login.js'
import { Register }     from './pages/Register.js'
import { Dashboard }    from './pages/Dashboard.js'
import { Profiles }     from './pages/Profiles.js'
import { ProfileWizard } from './pages/ProfileWizard.js'
import { Brokers }      from './pages/Brokers.js'
import { ManualGuide }  from './pages/ManualGuide.js'
import { History }      from './pages/History.js'
import { Settings }     from './pages/Settings.js'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, initialized } = useAuthStore()
  const location = useLocation()

  if (!initialized) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">Loading…</div>
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return <>{children}</>
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  if (user?.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

export function App() {
  const { refresh } = useAuthStore()

  useEffect(() => { refresh() }, [])

  return (
    <Routes>
      <Route path="/login"    element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/*" element={
        <AuthGuard>
          <Layout>
            <Routes>
              <Route index             element={<Dashboard />} />
              <Route path="profiles"   element={<Profiles />} />
              <Route path="profiles/new" element={<ProfileWizard />} />
              <Route path="brokers"    element={<Brokers />} />
              <Route path="history"    element={<History />} />
              <Route path="guide"      element={<ManualGuide />} />
              <Route path="settings"   element={<AdminGuard><Settings /></AdminGuard>} />
            </Routes>
          </Layout>
        </AuthGuard>
      } />
    </Routes>
  )
}
