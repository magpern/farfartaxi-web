import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../api/client'
import { cacheRide, readCachedRide } from './rideCache'
import type { RideResponse } from './rideTypes'

export type RideState = {
  ride: RideResponse | null
  /** When the data was last confirmed by the server (or cached), ms epoch. */
  lastUpdated: number | null
  /** Last refresh failed (offline / backend down): data shown is the last known. */
  failed: boolean
  /** Ride no longer visible to this user (404/403). */
  gone: boolean
  loading: boolean
  refresh: () => Promise<void>
}

/**
 * One ride, polled every `intervalMs` while the page is visible and refreshed on visibilitychange / reconnect.
 * Starts from the localStorage snapshot so the screen (and Ring/SMS) works with no connection.
 */
export function useRide(id: string | number | undefined, token: string, intervalMs = 5000): RideState {
  const [state, setState] = useState<Omit<RideState, 'refresh'>>(() => {
    const cached = id != null ? readCachedRide(id) : null
    return { ride: cached?.ride ?? null, lastUpdated: cached?.savedAt ?? null, failed: false, gone: false, loading: true }
  })
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    if (id == null) return
    try {
      const ride = await api<RideResponse>(`/api/rides/${id}`, { token })
      if (!alive.current) return
      cacheRide(ride)
      setState({ ride, lastUpdated: Date.now(), failed: false, gone: false, loading: false })
    } catch (err) {
      if (!alive.current) return
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
        setState((s) => ({ ...s, gone: true, loading: false, failed: false }))
      } else {
        setState((s) => ({ ...s, failed: true, loading: false }))
      }
    }
  }, [id, token])

  useEffect(() => {
    alive.current = true
    void refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, intervalMs)
    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onVis)
    return () => {
      alive.current = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', onVis)
    }
  }, [refresh, intervalMs])

  return { ...state, refresh }
}
