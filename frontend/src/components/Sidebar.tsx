import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Shield, Clock, BookOpen, Settings, LogOut, Moon } from 'lucide-react'
import { useAuthStore } from '../store/auth.js'

export function Sidebar() {
  const { user, logout } = useAuthStore()

  const adminLinks = [
    { to: '/',         icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/profiles', icon: Users,           label: 'Profiles' },
    { to: '/brokers',  icon: Shield,          label: 'Brokers' },
    { to: '/history',  icon: Clock,           label: 'History' },
    { to: '/guide',    icon: BookOpen,        label: 'Manual Guide' },
    { to: '/settings', icon: Settings,        label: 'Settings' },
  ]

  const userLinks = [
    { to: '/',        icon: LayoutDashboard, label: 'My Profile' },
    { to: '/brokers', icon: Shield,          label: 'My opt-outs' },
    { to: '/history', icon: Clock,           label: 'History' },
    { to: '/guide',   icon: BookOpen,        label: 'Manual Guide' },
  ]

  const links = user?.role === 'admin' ? adminLinks : userLinks

  return (
    <aside className="w-56 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col h-screen sticky top-0">
      <div className="px-4 py-5 flex items-center gap-3 border-b border-slate-800">
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
          <Moon size={16} className="text-white" />
        </div>
        <span className="text-white font-semibold tracking-wide">Nyx</span>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                isActive
                  ? 'bg-brand-600/20 text-brand-400 font-medium'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-slate-800">
        <div className="text-xs text-slate-500 mb-1 truncate">{user?.email}</div>
        <div className="flex items-center justify-between">
          <span className={`text-xs px-2 py-0.5 rounded ${user?.role === 'admin' ? 'bg-brand-900 text-brand-300' : 'bg-slate-700 text-slate-400'}`}>
            {user?.role}
          </span>
          <button onClick={logout} className="text-slate-500 hover:text-red-400 transition" title="Logout">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}
