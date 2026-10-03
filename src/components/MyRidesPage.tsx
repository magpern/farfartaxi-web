import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useI18n } from '../i18n/context'
import { apiErrorMessage } from '../lib/apiErrors'
import { rideStatusLabel } from '../lib/rideStatus'
import type { RideResponse } from '../lib/rideTypes'
import { formatDateTime } from '../lib/time'
import { PassengerRideCard } from './PassengerRideCard'

export function MyRidesPage({ token, onToast }: { token: string; onToast: (m: string) => void }) {
  const { t, locale } = useI18n()
  const [upcoming, setUpcoming] = useState<RideResponse[]>([])
  const [history, setHistory] = useState<RideResponse[]>([])
  const dateLocale = locale === 'en' ? 'en-GB' : 'sv-SE'

  const load = useCallback(async () => {
    try {
      const [up, hist] = await Promise.all([
        api<RideResponse[]>('/api/rides/my?history=false', { token }),
        api<RideResponse[]>('/api/rides/my?history=true', { token })
      ])
      setUpcoming(up)
      setHistory(hist)
    } catch {
      /* keep the last known lists; the next poll retries */
    }
  }, [token])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), 15000)
    return () => window.clearInterval(id)
  }, [load])

  async function share(rideId: number) {
    try {
      const res = await api<{ url: string }>(`/api/rides/${rideId}/share`, { method: 'POST', token })
      await navigator.clipboard.writeText(res.url)
      onToast(t('rides.shareCopiedToast'))
    } catch (err) {
      onToast(apiErrorMessage(err, t))
    }
  }

  async function feedback(rideId: number) {
    try {
      await api(`/api/rides/${rideId}/feedback`, {
        method: 'POST',
        token,
        body: JSON.stringify({ stars: 5, comment: t('rides.feedbackComment') })
      })
      onToast(t('rides.feedbackThanksToast'))
    } catch (err) {
      onToast(apiErrorMessage(err, t))
    }
  }

  async function deleteRide(rideId: number) {
    try {
      await api(`/api/rides/${rideId}`, { method: 'DELETE', token })
      onToast(t('rides.deletedToast'))
    } catch (err) {
      onToast(apiErrorMessage(err, t))
    } finally {
      await load()
    }
  }

  return (
    <div className="subpage-wrap stack">
      <Link className="link-back" to="/app">
        {t('rides.backToBooking')}
      </Link>
      <div className="card">
        <h3>{t('rides.upcoming')}</h3>
        <p className="rides-share-hint">{t('rides.shareTripHint')}</p>
        {upcoming.length === 0 && <p>{t('rides.noUpcoming')}</p>}
        {upcoming.map((ride) => (
          <PassengerRideCard
            key={ride.id}
            ride={ride}
            token={token}
            onToast={onToast}
            onChanged={load}
            onShare={share}
            onDelete={deleteRide}
          />
        ))}
      </div>
      <div className="card">
        <h3>{t('rides.history')}</h3>
        {history.length === 0 && <p>{t('rides.noHistory')}</p>}
        {history.map((ride) => (
          <article key={ride.id} className="ride-item">
            <p>
              {ride.fromAddress} {t('rides.toWord')} {ride.toAddress}
            </p>
            <p>
              {formatDateTime(ride.scheduledAt, dateLocale)} - {rideStatusLabel(t, ride.status)}
            </p>
            <div className="row ride-actions">
              {ride.status === 'COMPLETED' && (
                <button type="button" className="btn btn-touch" onClick={() => feedback(ride.id)}>
                  {t('rides.thanksStars')}
                </button>
              )}
              {ride.status === 'CANCELLED' && (
                <button type="button" onClick={() => deleteRide(ride.id)} className="btn btn-touch btn-danger">
                  {t('rides.delete')}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
