import { renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BottomSheet } from '../components/ui/BottomSheet'
import { resetOverlayRegistry } from '../components/ui/overlayRegistry'
import { defaultDraft } from '../lib/bookingDraft'
import { renderApp } from '../test/render'
import { __isReloadUnsafe } from './integrationStubs'
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
