import { renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BottomSheet } from '../components/ui/BottomSheet'
import { resetOverlayRegistry } from '../components/ui/overlayRegistry'
import { defaultDraft } from '../lib/bookingDraft'
import { writeActivePointer } from './activeRide'
import { renderApp, ride } from '../test/render'
import { isUnsafe as __isReloadUnsafe } from '../pwa/updatePolicy'
import { isUnsafeToReload, useUpdateGuard } from './updateGuard'

afterEach(() => {
  resetOverlayRegistry()
  ;(document.activeElement as HTMLElement | null)?.blur()
})

describe('isUnsafeToReload', () => {
  const idle = { hasActiveRide: false, draft: defaultDraft, overlayOpen: false }
  it('is safe when idle', () => expect(isUnsafeToReload(idle)).toBe(false))
  it('is unsafe with an active ride', () => expect(isUnsafeToReload({ ...idle, hasActiveRide: true })).toBe(true))
  it('is unsafe once any booking field is filled', () => {
    expect(isUnsafeToReload({ ...idle, draft: { ...defaultDraft, toAddress: 'Skolan' } })).toBe(true)
    expect(isUnsafeToReload({ ...idle, draft: { ...defaultDraft, pickupNote: 'blå dörr' } })).toBe(true)
  })
  it('is unsafe with a fresh cached active-ride pointer or a mutation in flight', () => {
    expect(isUnsafeToReload({ ...idle, pointerActive: true })).toBe(true)
    expect(isUnsafeToReload({ ...idle, mutationInFlight: true })).toBe(true)
  })
  it('is unsafe with an open dialog/sheet/form', () => expect(isUnsafeToReload({ ...idle, overlayOpen: true })).toBe(true))
})

describe('useUpdateGuard registration', () => {
  it('reports unsafe for a live ride and a draft, and safe otherwise', () => {
    const { rerender, unmount } = renderHook((p: { ride: boolean; draft: typeof defaultDraft }) => useUpdateGuard(p.ride, p.draft), {
      initialProps: { ride: false, draft: defaultDraft }
    })
    expect(__isReloadUnsafe()).toBe(false)
    rerender({ ride: true, draft: defaultDraft })
    expect(__isReloadUnsafe()).toBe(true)
    rerender({ ride: false, draft: { ...defaultDraft, fromAddress: 'Hem' } })
    expect(__isReloadUnsafe()).toBe(true)
    unmount()
    expect(__isReloadUnsafe()).toBe(false)
  })

  it('treats a fresh cached active-ride pointer as an active ride (cold start offline)', () => {
    localStorage.clear()
    renderHook(() => useUpdateGuard(false, defaultDraft, 5))
    expect(__isReloadUnsafe()).toBe(false)
    writeActivePointer(5, { role: 'PASSENGER', ride: ride('ACCEPTED') })
    expect(__isReloadUnsafe()).toBe(true)
    localStorage.clear()
  })

  it('reports unsafe while a bottom sheet is open', () => {
    renderHook(() => useUpdateGuard(false, defaultDraft))
    expect(__isReloadUnsafe()).toBe(false)
    const { unmount } = renderApp(
      <BottomSheet open title="Test" onClose={() => {}}>
        x
      </BottomSheet>
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(__isReloadUnsafe()).toBe(true)
    unmount()
    expect(__isReloadUnsafe()).toBe(false)
  })
})
