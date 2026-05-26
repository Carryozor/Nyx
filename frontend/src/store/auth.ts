import { create } from 'zustand'
import type { User } from '../types.js'
import { api } from '../api/client.js'

interface AuthState {
  user:        User | null
  loading:     boolean
  initialized: boolean
  login:       (email: string, password: string) => Promise<void>
  logout:      () => Promise<void>
  refresh:     () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user:        null,
  loading:     false,
  initialized: false,

  login: async (email, password) => {
    set({ loading: true })
    try {
      const user = await api.login(email, password) as User
      set({ user, loading: false })
    } catch (err) {
      set({ loading: false })
      throw err
    }
  },

  logout: async () => {
    await api.logout()
    set({ user: null })
  },

  refresh: async () => {
    try {
      const user = await api.me() as User
      set({ user, initialized: true })
    } catch {
      set({ user: null, initialized: true })
    }
  },
}))
