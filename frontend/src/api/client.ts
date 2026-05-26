class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 204) return undefined as T

  const data = await res.json().catch(() => ({ error: res.statusText }))
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Unknown error')
  return data as T
}

export const api = {
  // Auth
  register: (email: string, password: string, invitationToken?: string) =>
    req('POST', '/auth/register', { email, password, invitationToken }),
  login:    (email: string, password: string) =>
    req('POST', '/auth/login', { email, password }),
  logout:   () => req('POST', '/auth/logout'),
  me:       () => req('GET', '/auth/me'),

  // Profiles
  profiles: {
    list:    () => req('GET', '/profiles'),
    create:  (label: string, password: string, pii: unknown) =>
      req('POST', '/profiles', { label, password, pii }),
    get:     (id: string) => req('GET', `/profiles/${id}`),
    decrypt: (id: string, password: string) =>
      req('POST', `/profiles/${id}/decrypt`, { password }),
    update:  (id: string, password: string, pii: unknown, label?: string) =>
      req('PATCH', `/profiles/${id}`, { password, pii, label }),
    delete:  (id: string) => req('DELETE', `/profiles/${id}`),
  },

  // Brokers
  brokers: {
    list: (type?: string) => req('GET', `/brokers${type ? `?type=${type}` : ''}`),
    get:  (id: string) => req('GET', `/brokers/${id}`),
  },

  // Opt-outs
  optOuts: {
    forProfile: (profileId: string) => req('GET', `/profiles/${profileId}/opt-outs`),
    get:        (id: string) => req('GET', `/opt-outs/${id}`),
  },

  // Scans
  scans: {
    create: (profileId: string, password: string) =>
      req('POST', '/scans', { profileId, password }),
    list:   () => req('GET', '/scans'),
    get:    (id: string) => req('GET', `/scans/${id}`),
  },

  // Invitations
  invitations: {
    create: (email: string) => req('POST', '/invitations', { email }),
    list:   () => req('GET', '/invitations'),
  },

  // Email configs
  emailConfig: {
    get:    (profileId: string) => req('GET', `/profiles/${profileId}/email-config`),
    set:    (profileId: string, password: string, provider: string, credentials: unknown) =>
      req('POST', `/profiles/${profileId}/email-config`, { password, provider, credentials }),
    delete: (profileId: string) => req('DELETE', `/profiles/${profileId}/email-config`),
  },

  // Schedules
  schedule: {
    get:    (profileId: string) => req('GET', `/profiles/${profileId}/schedule`),
    set:    (profileId: string, password: string, intervalDays: number) =>
      req('POST', `/profiles/${profileId}/schedule`, { password, intervalDays }),
    delete: (profileId: string) => req('DELETE', `/profiles/${profileId}/schedule`),
  },
}

export { ApiError }
