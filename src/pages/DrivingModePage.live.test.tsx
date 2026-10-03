import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp, ride } from '../test/render'
import { DrivingModePage } from './DrivingModePage'

const apiMock = vi.fn()
vi.mock('../api/client', async (orig) => ({
  ...(await orig<typeof import('../api/client')>()),
  api: (...a: unknown[]) => apiMock(...a)
}))
const tracking = vi.hoisted(() => ({ error: null as null | 'denied' | 'unavailable', retry: vi.fn() }))
vi.mock('../lib/useDriverTracking', () => ({
  useTrackingError: () => tracking.error,
  retryTracking: () => tracking.retry()
}))
vi.mock('../shell/ActiveRide', () => ({ useActiveRide: () => ({ refresh: async () => {} }) }))

const enRoute = ride('EN_ROUTE', ['ARRIVE'], { passengerName: 'Lisa Berg', acceptedByDriverId: 1 })
const flush = () => act(async () => {})

function show() {
  renderApp(
    <Routes>
      <Route path="/app/kor/:id" element={<DrivingModePage />} />
    </Routes>,
    { path: '/app/kor/7', role: 'DRIVER' }
  )
}

beforeEach(() => {
  apiMock.mockReset()
  tracking.error = null
  tracking.retry.mockReset()
  apiMock.mockImplementation((path: string) => (path === '/api/rides/7' ? Promise.resolve(enRoute) : Promise.resolve([])))
})
afterEach(() => {
  delete (navigator as unknown as Record<string, unknown>).wakeLock
})

describe('driving mode live bits', () => {
  it('holds the wake lock and shows the indicator', async () => {
    const s = { released: false, release: vi.fn(() => Promise.resolve()), addEventListener: vi.fn() }
    const request = vi.fn(() => Promise.resolve(s))
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })
    show()
    await flush()
    await flush()
    expect(request).toHaveBeenCalledWith('screen')
    expect(await screen.findByText(/Skärmen hålls tänd/)).toBeInTheDocument()
  })

  it('shows the hint when the wake lock is unsupported', async () => {
    show()
    expect(await screen.findByText('Håll skärmen tänd medan du kör')).toBeInTheDocument()
  })

  it('shows settings guidance, not a retry button, when permission is denied', async () => {
    tracking.error = 'denied'
    show()
    expect(await screen.findByText(/Platsåtkomst är blockerad/)).toBeInTheDocument()
    expect(screen.getByTestId('location-denied-help')).toHaveTextContent(/webbplatsinställningarna/)
    expect(screen.queryByRole('button', { name: 'Försök igen' })).toBeNull()
  })

  it('shows the red banner with a retry button when GPS is unavailable', async () => {
    tracking.error = 'unavailable'
    show()
    expect(await screen.findByText('Platsdelning är av – Lisa ser dig inte på kartan')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Försök igen' }))
    expect(tracking.retry).toHaveBeenCalled()
  })

  it('no banner when tracking is fine', async () => {
    show()
    await screen.findByText('Håll skärmen tänd medan du kör')
    expect(screen.queryByText(/Platsdelning är av/)).toBeNull()
  })
})
