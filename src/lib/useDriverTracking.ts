import { useEffect, useSyncExternalStore } from 'react'
import { api } from '../api/client'
import { haversine } from './geo'
import { DRIVING_STATUSES, type RideResponse } from './rideTypes'

export const GPS_MIN_INTERVAL_MS = 10_000
export const GPS_MIN_MOVE_M = 50
/** Re-send the last fix this often when no new one went out (stationary at pickup must not look stale). */
export const HEARTBEAT_MS = 60_000
const HEARTBEAT_CHECK_MS = 5_000

/** Shared between the shell (which runs the GPS watch) and the driving screen (which shows the banner). */
export type TrackingError = 'denied' | 'unavailable' | null
let trackingError: TrackingError = null
let retryNonce = 0
const listeners = new Set<() => void>()
function emit() {
  listeners.forEach((l) => l())
}
function setTrackingError(e: TrackingError) {
  if (e === trackingError) return
  trackingError = e
  emit()
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
/** Why location sharing is not working (permission denied / no GPS), or null when it is fine or not needed. */
export function useTrackingError(): TrackingError {
  return useSyncExternalStore(subscribe, () => trackingError)
}
/** Restart the GPS watch (re-prompts for permission where the browser allows it). */
export function retryTracking() {
  retryNonce += 1
  emit()
}
const useRetryNonce = () => useSyncExternalStore(subscribe, () => retryNonce)

type Sent = { lat: number; lon: number; at: number; accuracy: number }

/** Send the first fix, then at most every 10 s, or at once after moving >= 50 m since the last sent fix. */
export function shouldSendFix(last: { lat: number; lon: number; at: number } | null, lat: number, lon: number, now: number): boolean {
  if (!last) return true
  if (now - last.at >= GPS_MIN_INTERVAL_MS) return true
  return haversine(last.lat, last.lon, lat, lon) * 1000 >= GPS_MIN_MOVE_M
}

/**
 * Streams the driver's position for the ride currently EN_ROUTE / ARRIVED / PICKED_UP.
 * Driven by ride status, so it starts after START, survives a reload mid-ride, and stops on
 * COMPLETE / RETURN (the ride leaves those statuses).
 */
export function useDriverTracking(token: string, myRides: RideResponse[]) {
  const activeId = myRides.find((r) => DRIVING_STATUSES.includes(r.status))?.id ?? null
  const nonce = useRetryNonce()

  useEffect(() => {
    if (activeId === null) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setTrackingError('unavailable')
      return () => setTrackingError(null)
    }
    let last: Sent | null = null
    const send = (s: Sent) => {
      last = { ...s }
      api(`/api/driver/rides/${activeId}/location`, {
        method: 'POST',
        token,
        body: JSON.stringify({ lat: s.lat, lon: s.lon, accuracy: s.accuracy })
      }).catch(() => {
        /* a missed position update is not worth interrupting the driver */
      })
    }
    const heartbeat = window.setInterval(() => {
      if (last && Date.now() - last.at >= HEARTBEAT_MS) send({ ...last, at: Date.now() })
    }, HEARTBEAT_CHECK_MS)
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setTrackingError(null)
        const now = Date.now()
        if (!shouldSendFix(last, pos.coords.latitude, pos.coords.longitude, now)) return
        send({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy, at: now })
      },
      (err) => {
        // Driving still works without live position; the driving screen shows a banner with a retry button.
        setTrackingError(err.code === 1 ? 'denied' : 'unavailable')
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
    return () => {
      window.clearInterval(heartbeat)
      navigator.geolocation.clearWatch(id)
      setTrackingError(null)
    }
  }, [activeId, token, nonce])
}
