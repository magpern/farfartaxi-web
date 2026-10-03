import { useEffect, useState } from 'react'

type Sentinel = { released: boolean; release: () => Promise<void>; addEventListener: (t: 'release', cb: () => void) => void }
type WakeLockApi = { request: (type: 'screen') => Promise<Sentinel> }

export function wakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator && !!(navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock
}

/**
 * Holds a screen wake lock while `active`. The browser drops it when the tab is hidden, so it is re-acquired when
 * the page becomes visible again; it is released when `active` turns false or the component unmounts.
 */
export function useWakeLock(active: boolean): { supported: boolean; held: boolean } {
  const supported = wakeLockSupported()
  const [held, setHeld] = useState(false)

  useEffect(() => {
    if (!active || !supported) return
    let cancelled = false
    let sentinel: Sentinel | null = null
    let inFlight = false
    const acquire = async () => {
      if (inFlight || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return
      inFlight = true
      try {
        const s = await (navigator as unknown as { wakeLock: WakeLockApi }).wakeLock.request('screen')
        if (cancelled || (sentinel && !sentinel.released)) {
          void s.release().catch(() => {}) // unmounted meanwhile, or a duplicate: do not leak a lock
          return
        }
        sentinel = s
        setHeld(true)
        s.addEventListener('release', () => {
          if (sentinel === s) setHeld(false)
        })
      } catch {
        setHeld(false) // denied (battery saver etc.): the hint is shown instead
      } finally {
        inFlight = false
      }
    }
    const onVis = () => void acquire()
    void acquire()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      const s = sentinel
      sentinel = null
      if (s && !s.released) void s.release().catch(() => {})
      setHeld(false)
    }
  }, [active, supported])

  return { supported, held: held && active }
}
