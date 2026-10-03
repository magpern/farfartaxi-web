import { useEffect } from 'react'

/** Counts open sheets/dialogs/forms so the PWA update guard knows a reload would lose user input. */
let openCount = 0

export function isAnyOverlayOpen(): boolean {
  return openCount > 0
}

/** Call from any modal/sheet/form while it is open. */
export function useOverlayOpen(open: boolean): void {
  useEffect(() => {
    if (!open) return
    openCount += 1
    return () => {
      openCount -= 1
    }
  }, [open])
}

/** Test helper. */
export function resetOverlayRegistry(): void {
  openCount = 0
}
