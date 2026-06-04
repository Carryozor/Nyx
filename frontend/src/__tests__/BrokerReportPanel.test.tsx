import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { BrokerReportPanel } from '../components/BrokerReportPanel.js'
import type { OptOutRequest } from '../types.js'

vi.mock('../api/client.js', () => ({
  api: {
    optOuts: {
      screenshots: vi.fn().mockResolvedValue([]),
    },
  },
}))

vi.mock('../components/StatusBadge.js', () => ({
  StatusBadge: ({ status }: { status: string }) => <span data-testid="status-badge">{status}</span>,
}))

const baseOptOut: OptOutRequest = {
  id: 'oo1',
  profile_id: 'p1',
  broker_id: 'spokeo',
  status: 'failed',
  submitted_at: null,
  confirmed_at: null,
  last_attempt: '2026-06-04T14:32:00.000Z',
  attempts: 3,
  notes: 'captcha on Spokeo search',
  screenshot: null,
  confirmation_pattern: null,
  manual_guide: null,
  broker_name: 'Spokeo',
  broker_type: 'auto',
  broker_url: 'https://www.spokeo.com/optout',
}

describe('BrokerReportPanel', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('ne rend rien si optOut est null', () => {
    const { container } = render(
      <BrokerReportPanel optOut={null} onClose={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('affiche le nom du broker et le statut', () => {
    render(<BrokerReportPanel optOut={baseOptOut} onClose={vi.fn()} />)
    expect(screen.getByText('Spokeo')).toBeInTheDocument()
  })

  it('affiche les notes quand elles sont présentes', () => {
    render(<BrokerReportPanel optOut={baseOptOut} onClose={vi.fn()} />)
    expect(screen.getByText('captcha on Spokeo search')).toBeInTheDocument()
  })

  it("n'affiche pas la section notes si notes est null", () => {
    render(<BrokerReportPanel optOut={{ ...baseOptOut, notes: null }} onClose={vi.fn()} />)
    expect(screen.queryByText(/raison/i)).not.toBeInTheDocument()
  })

  it('affiche le confirmation_pattern pour awaiting_email', () => {
    const optOut = { ...baseOptOut, status: 'awaiting_email' as const, confirmation_pattern: 'spokeo-pattern' }
    render(<BrokerReportPanel optOut={optOut} onClose={vi.fn()} />)
    expect(screen.getByText('spokeo-pattern')).toBeInTheDocument()
  })

  it('affiche le guide manuel si manual_guide est présent', () => {
    const guide = '1. Va sur whitepages.com\n2. Cherche ton nom'
    render(<BrokerReportPanel optOut={{ ...baseOptOut, manual_guide: guide }} onClose={vi.fn()} />)
    expect(screen.getByText(/Va sur whitepages\.com/)).toBeInTheDocument()
  })

  it('appelle onClose quand on clique le bouton fermer', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<BrokerReportPanel optOut={baseOptOut} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: /fermer/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('appelle onClose sur Échap', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<BrokerReportPanel optOut={baseOptOut} onClose={onClose} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('charge et affiche les screenshots disponibles', async () => {
    const { api } = await import('../api/client.js')
    vi.mocked(api.optOuts.screenshots).mockResolvedValue([
      { filename: 'form-filled.png', url: '/api/opt-outs/oo1/screenshot/form-filled.png' },
    ])
    render(<BrokerReportPanel optOut={{ ...baseOptOut, screenshot: 'job1' }} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByAltText('form-filled.png')).toBeInTheDocument())
  })
})
