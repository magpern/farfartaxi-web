import { screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { cacheRide, readCachedRide } from '../lib/rideCache'
import { renderApp, ride } from '../test/render'
import { ActiveRidePage } from './ActiveRidePage'

vi.mock('../components/LiveRideMap', () => ({
  LiveRideMap: (p: { car: unknown; target: string }) => <div data-testid="map" data-target={p.target} data-car={JSON.stringify(p.car)} />
}))

const apiMock = vi.fn()
vi.mock('../api/client', async (orig) => ({
  ...(await orig<typeof import('../api/client')>()),
  api: (...a: unknown[]) => apiMock(...a)
}))

const accepted = ride('ACCEPTED', ['CANCEL', 'MESSAGE'], {
  acceptedByDriverId: 9,
  acceptedByDriverName: 'Folke Berg',
  driverPhone: '070-123 45 67',
  driverVehicleNote: 'Blå Volvo ABC123'
})

function show() {
  renderApp(
    <Routes>
      <Route path="/app/resa/:id" element={<ActiveRidePage />} />
    </Routes>,
    { path: '/app/resa/7' }
  )
}

beforeEach(() => {
  apiMock.mockReset()
  localStorage.clear()
})

describe('passenger ride screen', () => {
  it('shows a friendly headline, driver card, Ring/SMS and the last-updated label', async () => {
    apiMock.mockImplementation((path: string) =>
      path === '/api/rides/7' ? Promise.resolve({ ...accepted, status: 'EN_ROUTE' }) : Promise.resolve([])
    )
    show()
    expect(await screen.findByRole('heading', { name: 'Folke är på väg' })).toBeInTheDocument()
    expect(screen.getByText('Blå Volvo ABC123')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ring Folke' })).toHaveAttribute('href', 'tel:0701234567')
    expect(screen.getByRole('link', { name: 'Skicka SMS till Folke' })).toHaveAttribute('href', 'sms:0701234567')
    expect(screen.getByText(/Senast uppdaterad \d\d:\d\d/)).toBeInTheDocument()
    expect(screen.queryByText('EN_ROUTE')).toBeNull()
  })

  it('keeps Ring and SMS working from the cache when the backend cannot be reached', async () => {
    cacheRide(1, accepted)
    apiMock.mockRejectedValue(new TypeError('Failed to fetch'))
    show()
    expect(screen.getByRole('link', { name: 'Ring Folke' })).toHaveAttribute('href', 'tel:0701234567')
    expect(screen.getByRole('link', { name: 'Skicka SMS till Folke' })).toHaveAttribute('href', 'sms:0701234567')
    await waitFor(() => expect(screen.getByText(/Kunde inte nå servern/)).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Ring Folke' })).toBeInTheDocument()
  })

  it('without cache and without server it says so instead of spinning forever', async () => {
    apiMock.mockRejectedValue(new TypeError('Failed to fetch'))
    show()
    expect(await screen.findByText(/Kunde inte nå servern/)).toBeInTheDocument()
  })

  it('shows the friendly gone state, not stale cache, when the server answers 404', async () => {
    cacheRide(1, accepted)
    apiMock.mockRejectedValue(new ApiError('nope', 404))
    show()
    expect(await screen.findByText(/Resan finns inte längre/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ring Folke' })).toBeNull()
    expect(readCachedRide(1, 7)).toBeNull()
  })

  it('offers actions from availableActions only', async () => {
    apiMock.mockImplementation((path: string) => (path === '/api/rides/7' ? Promise.resolve(accepted) : Promise.resolve([])))
    show()
    expect(await screen.findByRole('button', { name: 'Avboka' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fortsätt vänta' })).toBeNull()
  })

  it('offers rating on a completed ride only when feedback is not given yet', async () => {
    const done = { ...accepted, status: 'COMPLETED', availableActions: [] as never[] }
    apiMock.mockImplementation((path: string) => (path === '/api/rides/7' ? Promise.resolve(done) : Promise.resolve([])))
    show()
    expect(await screen.findByRole('button', { name: 'Betygsätt resan' })).toBeInTheDocument()
  })

  it('hides rating when feedbackGiven is true', async () => {
    const done = { ...accepted, status: 'COMPLETED', availableActions: [] as never[], feedbackGiven: true }
    apiMock.mockImplementation((path: string) => (path === '/api/rides/7' ? Promise.resolve(done) : Promise.resolve([])))
    show()
    expect(await screen.findByRole('button', { name: 'Boka ny resa' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Betygsätt resan' })).toBeNull()
  })

  it('shows the live map, ETA line and share button while the car is on the way', async () => {
    apiMock.mockImplementation((path: string) =>
      path === '/api/rides/7'
        ? Promise.resolve({
            ...accepted,
            status: 'EN_ROUTE',
            etaMinutes: 6,
            etaTarget: 'PICKUP',
            lastDriverLat: 59.1,
            lastDriverLon: 18.1,
            lastLocationAccuracyM: 150,
            lastLocationAt: new Date().toISOString()
          })
        : Promise.resolve([])
    )
    show()
    expect(await screen.findByTestId('live-status-line')).toHaveTextContent('Folke är 6 min bort')
    expect(screen.getByTestId('map')).toHaveAttribute('data-car', JSON.stringify({ lat: 59.1, lon: 18.1, accuracyM: 150 }))
    expect(screen.getByRole('button', { name: 'Dela resan' })).toBeInTheDocument()
  })

  it('has no share button or map once completed', async () => {
    apiMock.mockImplementation((path: string) => (path === '/api/rides/7' ? Promise.resolve({ ...accepted, status: 'COMPLETED' }) : Promise.resolve([])))
    show()
    await screen.findByRole('heading')
    expect(screen.queryByRole('button', { name: 'Dela resan' })).toBeNull()
    expect(screen.queryByTestId('map')).toBeNull()
  })
})
