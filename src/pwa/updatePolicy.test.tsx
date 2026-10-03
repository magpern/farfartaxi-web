import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Opts = { onNeedRefresh: () => void }
let captured: Opts
const updateSW = vi.fn().mockResolvedValue(undefined)
vi.mock('virtual:pwa-register', () => ({
  registerSW: (o: Opts) => {
    captured = o
    return updateSW
  }
}))

import { I18nProvider } from '../i18n/context'
import { BOOKING_DRAFT_STORAGE_KEY } from '../lib/bookingDraft'
import { UpdateBanner, initPwa, registerUpdateGuard } from './index'

let teardown: () => void
function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: hidden ? 'hidden' : 'visible' })
  document.dispatchEvent(new Event('visibilitychange'))
}
/** Simulate an update found after the cold-start window. */
function lateUpdate() {
  act(() => {
    vi.advanceTimersByTime(6_000)
    captured.onNeedRefresh()
  })
}

beforeEach(() => {
  localStorage.setItem('farfartaxi-locale', 'sv')
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
  updateSW.mockClear()
  sessionStorage.clear()
  setHidden(false)
  teardown = initPwa()
})
afterEach(() => {
  teardown()
  vi.useRealTimers()
})

const renderBanner = () => render(<I18nProvider><UpdateBanner /></I18nProvider>)

describe('update policy', () => {
  it('1: active-ride guard + hidden -> not applied, banner shown', () => {
    const off = registerUpdateGuard(() => true)
    renderBanner()
    lateUpdate()
    act(() => setHidden(true))
    expect(updateSW).not.toHaveBeenCalled()
    act(() => setHidden(false))
    expect(screen.getByText('Ny version finns')).toBeInTheDocument()
    off()
  })

  it('2: no guard + hidden -> applied (also when it becomes hidden after the update arrived)', () => {
    renderBanner()
    lateUpdate()
    expect(updateSW).not.toHaveBeenCalled()
    act(() => setHidden(true))
    expect(updateSW).toHaveBeenCalledWith(true)
  })

  it('3: cold-start update (within window, no interaction) -> applied silently', () => {
    renderBanner()
    act(() => captured.onNeedRefresh())
    expect(updateSW).toHaveBeenCalledWith(true)
    expect(screen.queryByText('Ny version finns')).toBeNull()
  })

  it('3b: early update after user interaction is not cold start', () => {
    renderBanner()
    act(() => {
      window.dispatchEvent(new Event('pointerdown'))
      captured.onNeedRefresh()
    })
    expect(updateSW).not.toHaveBeenCalled()
    expect(screen.getByText('Ny version finns')).toBeInTheDocument()
  })

  it('4: banner tap applies even when guarded', () => {
    const off = registerUpdateGuard(() => true)
    renderBanner()
    lateUpdate()
    fireEvent.click(screen.getByRole('button', { name: 'Uppdatera' }))
    expect(updateSW).toHaveBeenCalledWith(true)
    off()
  })

  it('5: booking draft in progress blocks silent apply', () => {
    sessionStorage.setItem(
      BOOKING_DRAFT_STORAGE_KEY,
      JSON.stringify({ fromAddress: 'Torget 1', toAddress: '', fromLat: 1, fromLon: 2, toLat: 3, toLon: 4 })
    )
    renderBanner()
    lateUpdate()
    act(() => setHidden(true))
    expect(updateSW).not.toHaveBeenCalled()
    // draft cleared -> next hide applies
    sessionStorage.clear()
    act(() => setHidden(false))
    act(() => setHidden(true))
    expect(updateSW).toHaveBeenCalledTimes(1)
  })

  it('checks for updates every 30 min and on becoming visible', () => {
    const update = vi.fn().mockResolvedValue(undefined)
    ;(captured as unknown as { onRegisteredSW: (u: string, r: unknown) => void }).onRegisteredSW('/sw.js', { update })
    act(() => vi.advanceTimersByTime(30 * 60_000))
    expect(update).toHaveBeenCalledTimes(1)
    act(() => setHidden(true))
    act(() => setHidden(false))
    expect(update).toHaveBeenCalledTimes(2)
  })
})
