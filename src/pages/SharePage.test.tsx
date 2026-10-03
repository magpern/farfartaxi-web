import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n/context'
import { json, mockFetch } from '../test/fetchMock'
import { SharePage } from './SharePage'

vi.mock('../components/LiveRideMap', () => ({
  LiveRideMap: (p: { car: unknown; target: string }) => <div data-testid="map" data-target={p.target} data-car={JSON.stringify(p.car)} />
}))

const shared = {
  passengerFirstName: 'Lisa',
  driverFirstName: 'Folke',
  status: 'EN_ROUTE',
  statusLabelKey: 'x',
  scheduledAt: '2026-10-25T12:00:00Z',
  pickup: { lat: 59, lon: 18, label: 'Storgatan 1' },
  destination: { lat: 59.1, lon: 18.1, label: 'Skolan' },
  driver: { lat: 59.01, lon: 18.01, accuracyM: 12, updatedAt: new Date().toISOString() },
  etaMinutes: 6,
  etaTarget: 'PICKUP',
  locationStale: false
}

function show() {
  render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/dela/tok123']}>
        <Routes>
          <Route path="/dela/:token" element={<SharePage />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  )
}
const flush = () => act(async () => {})

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('farfartaxi-locale', 'sv')
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const publicOnly = (fn: ReturnType<typeof mockFetch>) => {
  for (const [url, init] of fn.mock.calls) {
    expect(String(url)).toContain('/api/public/share/tok123')
    expect(new Headers((init as RequestInit).headers).has('Authorization')).toBe(false)
  }
}

describe('SharePage', () => {
  it('renders the ride, polls every 10 s, and never sends credentials', async () => {
    const fn = mockFetch((u) => (u.pathname === '/api/public/share/tok123' ? json(shared) : undefined))
    show()
    await flush()
    expect(screen.getByRole('heading', { name: 'Lisa åker med Folke' })).toBeInTheDocument()
    expect(screen.getByTestId('live-status-line')).toHaveTextContent('Folke är 6 min bort')
    expect(screen.getByTestId('map')).toHaveAttribute('data-target', 'PICKUP')
    expect(screen.getByText(/Senast uppdaterad \d\d:\d\d/)).toBeInTheDocument()
    expect(fn).toHaveBeenCalledTimes(1)
    await act(async () => void vi.advanceTimersByTime(10_000))
    expect(fn).toHaveBeenCalledTimes(2)
    publicOnly(fn)
  })

  it('shows a stale warning from the server flag', async () => {
    mockFetch(() => json({ ...shared, locationStale: true }))
    show()
    await flush()
    expect(screen.getByTestId('live-stale')).toBeInTheDocument()
  })

  it('410 -> expired', async () => {
    const fn = mockFetch(() => json({ error: 'gone' }, 410))
    show()
    await flush()
    expect(screen.getByRole('heading', { name: 'Länken har gått ut' })).toBeInTheDocument()
    publicOnly(fn)
  })

  it('404 -> missing', async () => {
    const fn = mockFetch(() => json({ error: 'nope' }, 404))
    show()
    await flush()
    expect(screen.getByRole('heading', { name: 'Länken finns inte' })).toBeInTheDocument()
    publicOnly(fn)
  })

  it('429 is silent and keeps the last ride; the next poll recovers', async () => {
    let n = 0
    const fn = mockFetch(() => (++n === 2 ? json({ error: 'slow' }, 429) : json(shared)))
    show()
    await flush()
    await act(async () => void vi.advanceTimersByTime(10_000))
    expect(screen.getByRole('heading', { name: 'Lisa åker med Folke' })).toBeInTheDocument()
    expect(screen.queryByText(/Kunde inte hämta/)).toBeNull()
    await act(async () => void vi.advanceTimersByTime(10_000))
    expect(fn).toHaveBeenCalledTimes(3)
    expect(screen.getByRole('heading', { name: 'Lisa åker med Folke' })).toBeInTheDocument()
  })

  it('429 on the very first load shows no error text', async () => {
    mockFetch(() => json({ error: 'slow' }, 429))
    show()
    await flush()
    expect(screen.queryByText(/Kunde inte hämta/)).toBeNull()
    expect(screen.queryByRole('heading')).toBeNull()
  })
})
