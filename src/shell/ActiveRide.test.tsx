import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveRideResponse } from '../lib/rideTypes'
import { ride } from '../test/render'
import { ActiveRideProvider } from './ActiveRide'

const apiMock = vi.fn()
vi.mock('../api/client', () => ({ api: (...a: unknown[]) => apiMock(...a) }))

function Where() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <div data-testid="path">{pathname}</div>
      <button onClick={() => navigate('/app')}>to-home</button>
    </>
  )
}

function setup(start: string) {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <ActiveRideProvider token="t" userId={1}>
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </ActiveRideProvider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  apiMock.mockReset()
  localStorage.clear()
})

describe('ActiveRideProvider redirect (global invariant)', () => {
  it('passenger with an active ride lands on /app/resa/:id', async () => {
    const res: ActiveRideResponse = { role: 'PASSENGER', ride: ride('EN_ROUTE') }
    apiMock.mockResolvedValue(res)
    setup('/app')
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/app/resa/7'))
  })

  it('driver with a driving ride lands in driving mode', async () => {
    apiMock.mockResolvedValue({ role: 'DRIVER', ride: ride('ARRIVED') })
    setup('/app/forare')
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/app/forare/kor/7'))
  })

  it('driver with only an ACCEPTED ride stays on driver home', async () => {
    apiMock.mockResolvedValue({ role: 'DRIVER', ride: ride('ACCEPTED') })
    setup('/app/forare')
    await waitFor(() => expect(apiMock).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.getByTestId('path')).toHaveTextContent('/app/forare')
  })

  it('no active ride (204) leaves the user on home', async () => {
    apiMock.mockResolvedValue(undefined)
    setup('/app')
    await waitFor(() => expect(apiMock).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.getByTestId('path')).toHaveTextContent('/app')
  })

  it('does not redirect when the user is already on another tab', async () => {
    apiMock.mockResolvedValue({ role: 'PASSENGER', ride: ride('ACCEPTED') })
    setup('/app/mer')
    await waitFor(() => expect(apiMock).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.getByTestId('path')).toHaveTextContent('/app/mer')
  })

  it('offline cold start falls back to the last known active ride', async () => {
    localStorage.setItem('farfartaxi-active-pointer:1', JSON.stringify({ role: 'PASSENGER', id: 9, status: 'ACCEPTED', at: Date.now() }))
    apiMock.mockRejectedValue(new TypeError('offline'))
    setup('/app')
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/app/resa/9'))
  })
})
