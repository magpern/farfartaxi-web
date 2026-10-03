import { useEffect } from 'react'
import { api } from '../api/client'
import { haversine } from './geo'
import { DRIVING_STATUSES, type RideResponse } from './rideTypes'

export const GPS_MIN_INTERVAL_MS = 10_000
export const GPS_MIN_MOVE_M = 50

type Sent = { lat: number; lon: number; at: number }

/** Send the first fix, then at most every 10 s, or at once after moving >= 50 m since the last sent fix. */
export function shouldSendFix(last: Sent | null, lat: number, lon: number, now: number): boolean {
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

  useEffect(() => {
    if (activeId === null || typeof navigator === 'undefined' || !navigator.geolocation) return
    let last: Sent | null = null
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now()
        if (!shouldSendFix(last, pos.coords.latitude, pos.coords.longitude, now)) return
        last = { lat: pos.coords.latitude, lon: pos.coords.longitude, at: now }
        api(`/api/driver/rides/${activeId}/location`, {
          method: 'POST',
          token,
          body: JSON.stringify({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          })
        }).catch(() => {
          /* a missed position update is not worth interrupting the driver */
        })
      },
      () => {
        /* permission denied / unavailable: driving still works without live position */
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [activeId, token])
}
