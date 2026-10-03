import { screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cacheRide } from '../lib/rideCache'
import { renderApp, ride } from '../test/render'
import { ActiveRidePage } from './ActiveRidePage'

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
    cacheRide(accepted)
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

  it('offers actions from availableActions only', async () => {
    apiMock.mockImplementation((path: string) => (path === '/api/rides/7' ? Promise.resolve(accepted) : Promise.resolve([])))
    show()
    expect(await screen.findByRole('button', { name: 'Avboka' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fortsätt vänta' })).toBeNull()
  })
})
