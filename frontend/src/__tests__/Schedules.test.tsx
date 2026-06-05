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

  it('shows profile card when profiles exist', async () => {
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

  it('shows Active badge and next scan when schedule enabled', async () => {
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
      expect(screen.getByText(/active/i)).toBeInTheDocument()
      expect(screen.getByText(/30 days/i)).toBeInTheDocument()
    })
  })
})
