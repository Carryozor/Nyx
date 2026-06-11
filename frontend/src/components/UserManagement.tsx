import { useEffect, useState } from 'react'
import { Users, Trash2 } from 'lucide-react'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'
import type { ManagedUser, Role } from '../types.js'

const ROLES: Role[] = ['viewer', 'editor', 'manager', 'admin']
const ROLE_LABEL: Record<Role, string> = {
  viewer: 'Observateur', editor: 'Éditeur', manager: 'Gestionnaire', admin: 'Administrateur',
}

/** Admin-only: list users, change their role, delete them. */
export function UserManagement() {
  const { user } = useAuthStore()
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [error, setError] = useState('')

  const isAdmin = user?.role === 'admin'
  const load = () => { api.users.list().then(setUsers).catch(() => setUsers([])) }
  useEffect(() => { if (isAdmin) load() }, [isAdmin])

  const changeRole = async (id: string, role: string) => {
    setError('')
    try { await api.users.setRole(id, role); load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Échec du changement de rôle'); load() }
  }

  const remove = async (u: ManagedUser) => {
    if (!confirm(`Supprimer l'utilisateur ${u.email} ? Ses profils et partages seront supprimés.`)) return
    setError('')
    try { await api.users.delete(u.id); load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Échec de la suppression') }
  }

  if (!isAdmin) return null

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
        <Users size={18} /> Utilisateurs
      </h2>

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

      <ul className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden">
        {users.map(u => (
          <li key={u.id} className="flex items-center gap-3 px-3 py-2.5 bg-slate-900">
            <span className="flex-1 text-sm text-slate-200 truncate">{u.email}</span>
            <select
              value={u.role}
              onChange={e => changeRole(u.id, e.target.value)}
              disabled={u.id === user?.id}
              title={u.id === user?.id ? 'Vous ne pouvez pas changer votre propre rôle ici' : 'Changer le rôle'}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
            >
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            <button
              onClick={() => remove(u)}
              disabled={u.id === user?.id}
              title={u.id === user?.id ? 'Vous ne pouvez pas vous supprimer' : 'Supprimer'}
              className="text-slate-500 hover:text-red-400 transition disabled:opacity-30"
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
