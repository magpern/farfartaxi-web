import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n/context'
import { LiveStatus } from './LiveStatus'

const T0 = new Date('2026-10-25T10:00:00Z')
beforeEach(() => {
  localStorage.setItem('farfartaxi-locale', 'sv')
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})
afterEach(() => vi.useRealTimers())

const ui = (props: Partial<React.ComponentProps<typeof LiveStatus>> = {}) => (
  <I18nProvider>
    <LiveStatus status="EN_ROUTE" etaTarget="PICKUP" etaMinutes={6} lastLocationAt={new Date(T0.getTime() - 20_000).toISOString()} name="Folke" {...props} />
  </I18nProvider>
)

describe('LiveStatus', () => {
  it('shows ETA text and ticks the relative time every second until it turns stale', () => {
    render(ui())
    expect(screen.getByTestId('live-status-line')).toHaveTextContent('Folke är 6 min bort')
    expect(screen.getByTestId('live-ago')).toHaveTextContent('uppdaterad för 20 s sedan')
    act(() => void vi.advanceTimersByTime(3000))
    expect(screen.getByTestId('live-ago')).toHaveTextContent('uppdaterad för 23 s sedan')
    expect(screen.queryByTestId('live-stale')).toBeNull()
    act(() => void vi.advanceTimersByTime(100_000))
    expect(screen.getByTestId('live-stale')).toHaveTextContent('Folkes position har inte uppdaterats på 2 min – skärmen kanske är avstängd')
  })

  it('shows the arrived and destination texts', () => {
    const { rerender } = render(ui({ status: 'ARRIVED' }))
    expect(screen.getByTestId('live-status-line')).toHaveTextContent('Folke är framme!')
    rerender(ui({ status: 'PICKED_UP', etaTarget: 'DESTINATION', etaMinutes: 12 }))
    expect(screen.getByTestId('live-status-line')).toHaveTextContent('Framme om ca 12 min')
  })

  it('warns when the server flags the position stale', () => {
    render(ui({ locationStale: true }))
    expect(screen.getByTestId('live-stale')).toBeInTheDocument()
  })

  it('shows "waiting" instead of the stale alert in the first minute without a position', () => {
    render(ui({ lastLocationAt: null, locationStale: true }))
    expect(screen.getByTestId('live-waiting')).toHaveTextContent('Väntar på Folkes position')
    expect(screen.queryByTestId('live-stale')).toBeNull()
    act(() => void vi.advanceTimersByTime(61_000))
    expect(screen.queryByTestId('live-waiting')).toBeNull()
    expect(screen.getByTestId('live-stale')).toBeInTheDocument()
  })

  it('computes the age against the server clock offset', () => {
    render(ui({ serverOffsetMs: 10_000 }))
    expect(screen.getByTestId('live-ago')).toHaveTextContent('uppdaterad för 30 s sedan')
  })
})
