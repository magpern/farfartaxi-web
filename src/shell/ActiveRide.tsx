import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { ActiveRideResponse } from '../lib/rideTypes'
import { decideActiveRideRedirect, isHomePath, readActivePointer, sameActive, writeActivePointer } from './activeRide'

type Value = {
  /** The caller's active ride (with the role it applies to), or null. */
  active: ActiveRideResponse | null
  /** True once the first answer (or failure) is in. */
  loaded: boolean
  refresh: () => Promise<void>
}

const ActiveRideContext = createContext<Value>({ active: null, loaded: false, refresh: async () => {} })

// eslint-disable-next-line react-refresh/only-export-components -- context module exports provider and hook together by design
export function useActiveRide(): Value {
  return useContext(ActiveRideContext)
}

const POLL_MS = 15_000
const RESUME_AFTER_MS = 30_000

/**
 * Global invariant: an active ride IS the home screen. Polls `GET /api/rides/active` on start, on focus /
 * visibility, on navigation to a home path and every 15 s while visible. The redirect is armed on app start
 * and on resume from background (hidden > 30 s) and fires once, only while the user is on a home path.
 */
export function ActiveRideProvider({ token, userId, children }: { token: string; userId: number; children: ReactNode }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [active, setActive] = useState<ActiveRideResponse | null>(null)
  const [loaded, setLoaded] = useState(false)
  const armed = useRef(true)
  const hiddenAt = useRef<number | null>(null)
  const pathRef = useRef(pathname)
  pathRef.current = pathname

  const apply = useCallback(
    (next: ActiveRideResponse | null) => {
      setActive((prev) => (sameActive(prev, next) ? prev : next))
      setLoaded(true)
      const target = decideActiveRideRedirect({ active: next, pathname: pathRef.current, armed: armed.current })
      if (armed.current && isHomePath(pathRef.current)) armed.current = false
      if (target) navigate(target, { replace: true })
    },
    [navigate]
  )

  const refresh = useCallback(async () => {
    try {
      const res = await api<ActiveRideResponse | undefined>('/api/rides/active', { token })
      const next = res && res.ride ? res : null
      writeActivePointer(userId, next)
      apply(next)
    } catch {
      // Offline / backend down: on a cold start fall back to the last known active ride so Ring/SMS stay reachable.
      if (!armed.current) return
      const p = readActivePointer(userId)
      if (p && p.role === 'PASSENGER' && isHomePath(pathRef.current)) {
        armed.current = false
        navigate(`/app/resa/${p.id}`, { replace: true })
      } else if (p && p.role === 'DRIVER' && ['EN_ROUTE', 'ARRIVED', 'PICKED_UP'].includes(p.status) && isHomePath(pathRef.current)) {
        armed.current = false
        navigate(`/app/forare/kor/${p.id}`, { replace: true })
      }
      setLoaded(true)
    }
  }, [token, userId, apply, navigate])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now()
        return
      }
      if (hiddenAt.current !== null && Date.now() - hiddenAt.current > RESUME_AFTER_MS) armed.current = true
      hiddenAt.current = null
      lastFocusRefresh = Date.now() // the focus event that usually follows must not refresh a second time
      void refresh()
    }
    // visibilitychange covers returning to the app; `focus` only matters on desktop where the tab stays visible.
    let lastFocusRefresh = 0
    const onFocus = () => {
      const now = Date.now()
      if (now - lastFocusRefresh < 1000) return
      lastFocusRefresh = now
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  // Route change to a home path: refresh so Home shows the current active-ride card.
  const firstPath = useRef(true)
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false
      return
    }
    if (isHomePath(pathname)) void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the path changes
  }, [pathname])

  const value = useMemo(() => ({ active, loaded, refresh }), [active, loaded, refresh])
  return <ActiveRideContext.Provider value={value}>{children}</ActiveRideContext.Provider>
}
