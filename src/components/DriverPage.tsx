import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import { useI18n } from '../i18n/context'
import { apiErrorMessage } from '../lib/apiErrors'
import type { RideResponse } from '../lib/rideTypes'
import { useDriverTracking } from '../lib/useDriverTracking'
import { DriverAvailability } from './DriverAvailability'
import { DriverRideCard } from './DriverRideCard'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function DriverPage({ token, userId, onToast }: { token: string; userId: number; onToast: (m: string) => void }) {
  const { t } = useI18n()
  const [myRides, setMyRides] = useState<RideResponse[]>([])
  const [openRides, setOpenRides] = useState<RideResponse[]>([])
  const [stats, setStats] = useState<{ completedRides: number; acceptedRides: number } | null>(null)

  const load = useCallback(async () => {
    try {
      const [mine, rides, statsRes] = await Promise.all([
        api<RideResponse[]>('/api/driver/rides/mine', { token }),
        api<RideResponse[]>('/api/driver/rides/open', { token }),
        api<{ completedRides: number; acceptedRides: number }>('/api/driver/stats', { token })
      ])
      setMyRides(mine)
      setOpenRides([...rides].sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent)))
      setStats(statsRes)
    } catch {
      /* keep the last known lists; the next poll retries */
    }
  }, [token])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), 10000)
    return () => window.clearInterval(id)
  }, [load])

  // GPS follows ride status: on from START through PICKED_UP, off on COMPLETE / RETURN.
  useDriverTracking(token, myRides)

  async function setupPush() {
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        onToast(t('driver.pushNotSupported'))
        return
      }
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        onToast(t('driver.pushDenied'))
        return
      }
      const registration = await navigator.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()
      const { publicKey } = await api<{ publicKey: string }>('/api/public/push-config')
      if (!publicKey) {
        onToast(t('driver.pushMissingKey'))
        return
      }
      const sub =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        }))
      const json = sub.toJSON()
      await api('/api/push/subscriptions', {
        method: 'POST',
        token,
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
          userAgent: navigator.userAgent
        })
      })
      onToast(t('driver.pushEnabled'))
    } catch (err) {
      onToast(apiErrorMessage(err, t))
    }
  }

  return (
    <div className="subpage-wrap stack">
      <DriverAvailability token={token} onToast={onToast} />
      <div className="card">
        <h3>{t('driver.panel')}</h3>
        <div className="row">
          <button className="btn btn-touch" onClick={() => void load()}>
            {t('driver.refresh')}
          </button>
          <button className="btn btn-touch" onClick={() => void setupPush()}>
            {t('driver.enablePush')}
          </button>
        </div>
        {stats && (
          <p>{t('driver.stats', { completed: stats.completedRides, accepted: stats.acceptedRides })}</p>
        )}
      </div>
      <div className="card">
        <h3>{t('driver.myRides')}</h3>
        {myRides.length === 0 && <p>{t('driver.noMyRides')}</p>}
        {myRides.map((ride) => (
          <DriverRideCard key={ride.id} ride={ride} token={token} userId={userId} onToast={onToast} onChanged={load} />
        ))}
      </div>
      <div className="card">
        <h3>{t('driver.openRides')}</h3>
        {openRides.length === 0 && <p>{t('driver.noOpenRides')}</p>}
        {openRides.map((ride) => (
          <DriverRideCard key={ride.id} ride={ride} token={token} userId={userId} onToast={onToast} onChanged={load} />
        ))}
      </div>
    </div>
  )
}
