import { useEffect, useRef } from 'react'
import { draftInProgress, type BookingDraft } from '../lib/bookingDraft'
import { isAnyOverlayOpen } from '../components/ui/overlayRegistry'
import { registerUpdateGuard } from '../pwa'
import { getInFlightMutations } from '../api/client'
import { readActivePointer } from './activeRide'

/** True when reloading the app (new service worker) would lose something: unsafe to update. */
export function isUnsafeToReload(state: {
  hasActiveRide: boolean
  draft: BookingDraft
  overlayOpen: boolean
  /** A fresh cached active-ride pointer (cold start offline, before the server has answered). */
  pointerActive?: boolean
  /** A non-GET request is in flight. */
  mutationInFlight?: boolean
}): boolean {
  return (
    state.hasActiveRide ||
    !!state.pointerActive ||
    !!state.mutationInFlight ||
    draftInProgress(state.draft) ||
    state.overlayOpen
  )
}

function isTextFieldFocused(): boolean {
  const el = typeof document === 'undefined' ? null : document.activeElement
  return !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'checkbox'))
}

/** Registers the guard with the PWA update flow for as long as the shell is mounted. */
export function useUpdateGuard(hasActiveRide: boolean, draft: BookingDraft, userId?: number): void {
  const ref = useRef({ hasActiveRide, draft, userId })
  ref.current = { hasActiveRide, draft, userId }
  useEffect(() => {
    const off = registerUpdateGuard(() =>
      isUnsafeToReload({
        hasActiveRide: ref.current.hasActiveRide,
        draft: ref.current.draft,
        overlayOpen: isAnyOverlayOpen() || isTextFieldFocused(),
        pointerActive: ref.current.userId != null && readActivePointer(ref.current.userId) !== null,
        mutationInFlight: getInFlightMutations() > 0
      })
    )
    return () => {
      if (typeof off === 'function') off()
    }
  }, [])
}
