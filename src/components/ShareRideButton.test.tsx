import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/render'
import { ShareRideButton } from './ShareRideButton'

const apiMock = vi.fn()
vi.mock('../api/client', async (orig) => ({
  ...(await orig<typeof import('../api/client')>()),
  api: (...a: unknown[]) => apiMock(...a)
}))

const toast = vi.fn()
const show = (extra: Partial<React.ComponentProps<typeof ShareRideButton>> = {}) =>
  renderApp(<ShareRideButton rideId={7} token="t" onToast={toast} {...extra} />)

beforeEach(() => {
  apiMock.mockReset()
  toast.mockReset()
  localStorage.clear()
  apiMock.mockResolvedValue({ token: 'abc', url: 'https://farfartaxi.pernemark.se/dela/abc', expiresAt: 'x' })
})
afterEach(() => {
  delete (navigator as unknown as Record<string, unknown>).share
})

describe('ShareRideButton', () => {
  it('uses the native share sheet when available', async () => {
    const share = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    show({ prefetch: true })
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1))
    await act(async () => {})
    await userEvent.click(screen.getByRole('button', { name: 'Dela resan' }))
    expect(share).toHaveBeenCalledWith({ title: 'Farfartaxi', text: 'Följ min resa', url: 'https://farfartaxi.pernemark.se/dela/abc' })
    expect(apiMock).toHaveBeenCalledTimes(1) // the link was created up front, not on tap
    expect(apiMock).toHaveBeenCalledWith('/api/rides/7/share', expect.objectContaining({ method: 'POST' }))
  })

  it('without a prefetched link, creates it and asks for a second explicit tap', async () => {
    const share = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Dela resan' }))
    const second = await screen.findByRole('button', { name: 'Dela länken' })
    expect(share).not.toHaveBeenCalled()
    await userEvent.click(second)
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://farfartaxi.pernemark.se/dela/abc' }))
    expect(await screen.findByRole('button', { name: 'Sluta dela' })).toBeInTheDocument()
  })

  it('falls back to the clipboard with a toast', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    show({ prefetch: true })
    await act(async () => {})
    await user.click(screen.getByRole('button', { name: 'Dela resan' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('https://farfartaxi.pernemark.se/dela/abc'))
    expect(toast).toHaveBeenCalledWith('Delningslänk kopierad.')
  })

  it('does not toast when the user closes the share sheet', async () => {
    const share = vi.fn(() => Promise.reject(new DOMException('x', 'AbortError')))
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    show({ prefetch: true })
    await act(async () => {})
    await userEvent.click(screen.getByRole('button', { name: 'Dela resan' }))
    await waitFor(() => expect(share).toHaveBeenCalled())
    expect(toast).not.toHaveBeenCalled()
  })

  it('revokes with DELETE', async () => {
    apiMock.mockResolvedValue(undefined)
    show({ shareActive: true })
    await userEvent.click(screen.getByRole('button', { name: 'Sluta dela' }))
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/api/rides/7/share', expect.objectContaining({ method: 'DELETE' })))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Sluta dela' })).toBeNull())
    expect(toast).toHaveBeenCalledWith('Delningen är avslutad.')
  })
})
