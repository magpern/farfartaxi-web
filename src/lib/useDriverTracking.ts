import { useEffect } from 'react'
import { api } from '../api/client'
import { DRIVING_STATUSES, type RideResponse } from './rideTypes'

/**
 * Streams the driver's position for the ride currently EN_ROUTE / ARRIVED / PICKED_UP.
 * Driven by ride status, so it starts after START, survives a reload mid-ride, and stops on
 * COMPLETE / RETURN (the ride leaves those statuses).
 */
export function useDriverTracking(token: string, myRides: RideResponse[]) {
  const activeId = myRides.find((r) => DRIVING_STATUSES.includes(r.status))?.id ?? null

  useEffect(() => {
    if (activeId === null || typeof navigator === 'undefined' || !navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      (pos) => {
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
