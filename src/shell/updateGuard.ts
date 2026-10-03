import { useEffect, useRef } from 'react'
import { draftInProgress, type BookingDraft } from '../lib/bookingDraft'
import { isAnyOverlayOpen } from '../components/ui/overlayRegistry'
import { registerUpdateGuard } from './integrationStubs'

/** True when reloading the app (new service worker) would lose something: unsafe to update. */
export function isUnsafeToReload(state: { hasActiveRide: boolean; draft: BookingDraft; overlayOpen: boolean }): boolean {
  return state.hasActiveRide || draftInProgress(state.draft) || state.overlayOpen
}

function isTextFieldFocused(): boolean {
  const el = typeof document === 'undefined' ? null : document.activeElement
  return !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'checkbox'))
}

/** Registers the guard with the PWA update flow for as long as the shell is mounted. */
export function useUpdateGuard(hasActiveRide: boolean, draft: BookingDraft): void {
  const ref = useRef({ hasActiveRide, draft })
  ref.current = { hasActiveRide, draft }
  useEffect(() => {
    const off = registerUpdateGuard(() =>
      isUnsafeToReload({ ...ref.current, overlayOpen: isAnyOverlayOpen() || isTextFieldFocused() })
    )
    return () => {
      if (typeof off === 'function') off()
    }
  }, [])
}
