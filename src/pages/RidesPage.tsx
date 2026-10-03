import { useCallback, useEffect, useMemo, useState } from 'react'
import { setBookingSource } from '../lib/telemetry'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useI18n } from '../i18n/context'
import { apiErrorMessage } from '../lib/apiErrors'
import { groupPassengerRides } from '../lib/rideGroups'
import type { RideResponse } from '../lib/rideTypes'
import { formatWeekdayDateTime } from '../lib/time'
import { PassengerRideCard } from '../components/PassengerRideCard'
import { RatingSheet } from '../components/RatingSheet'
import { Button, Card, StatusPill } from '../components/ui'
import { pollWhileVisible } from '../lib/pollWhileVisible'
import { useShell } from '../shell/ShellContext'
import { useBookingDraft } from '../shell/BookingDraftContext'
import { bookPath } from '../shell/types'
import { defaultDraft } from '../lib/bookingDraft'
import { haversine } from '../lib/geo'
import { useSavedPlaces } from '../lib/useSavedPlaces'
import { SavePlaceSheet } from '../components/SavePlaceSheet'
import type { PlaceDraft } from '../api/savedPlaces'

/** Compact row for a finished ride. */
export function PastRideRow({
  ride,
  perspective,
  onRate,
  onDelete,
  onRebook,
  onSavePlace
}: {
  ride: RideResponse
  perspective: 'passenger' | 'driver'
  onRate?: (id: number) => void
  onDelete?: (id: number) => void
  onRebook?: (ride: RideResponse) => void
  onSavePlace?: (ride: RideResponse) => void
}) {
  const { t, locale } = useI18n()
  const dateLocale = locale === 'en' ? 'en-GB' : 'sv-SE'
  return (
    <article className="ride-item past-ride">
      <p>
        <StatusPill status={ride.status} perspective={perspective} />{' '}
        <span className="muted">{formatWeekdayDateTime(ride.scheduledAt, dateLocale)}</span>
      </p>
      <p>
        {ride.fromAddress} {t('rides.toWord')} {ride.toAddress}
      </p>
      <div className="row ride-actions">
        {onRate && ride.status === 'COMPLETED' && !ride.feedbackGiven && <Button onClick={() => onRate(ride.id)}>{t('rating.cta')}</Button>}
        {onRebook && (
          <Button onClick={() => onRebook(ride)} aria-label={t('home.rebookAria', { to: ride.toAddress })}>
            🔁 {t('home.rebook')}
          </Button>
        )}
        {onSavePlace && (
          <Button onClick={() => onSavePlace(ride)} aria-label={t('places.saveAria', { name: ride.toAddress })}>
            ⭐ {t('places.saveAsPlace')}
          </Button>
        )}
        {onDelete && ride.status === 'CANCELLED' && (
          <Button variant="danger" onClick={() => onDelete(ride.id)}>
            {t('rides.delete')}
          </Button>
        )}
      </div>
    </article>
  )
}

export function Section({ title, empty, children, count }: { title: string; empty: string; count: number; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="section-title">{title}</h2>
      {count === 0 ? <p className="muted">{empty}</p> : children}
    </Card>
  )
}

export function RidesPage() {
  const { t } = useI18n()
  const { token, user, onToast } = useShell()
  const navigate = useNavigate()
  const { setDraft } = useBookingDraft()
  const saved = useSavedPlaces(token)
  const [savingPlace, setSavingPlace] = useState<PlaceDraft | null>(null)
  const [rides, setRides] = useState<RideResponse[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [rateId, setRateId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const [up, hist] = await Promise.all([
        api<RideResponse[]>('/api/rides/my?history=false', { token }),
        api<RideResponse[]>('/api/rides/my?history=true', { token })
      ])
      setRides([...up, ...hist])
      setFailed(false)
    } catch {
      setFailed(true) // keep the last known lists; the next poll retries
    }
  }, [token])

  useEffect(() => {
    void load()
    return pollWhileVisible(load, 15000)
  }, [load])

  const groups = useMemo(() => groupPassengerRides(rides ?? []), [rides])

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

  /** Completed rides to a destination that is not already a saved place. */
  const canSave = (r: RideResponse) =>
    r.status === 'COMPLETED' && saved.places !== null && !saved.places.some((p) => haversine(p.lat, p.lon, r.toLat, r.toLon) < 0.03)

  function rebook(r: RideResponse) {
    setBookingSource('rebook')
    setDraft({
      ...defaultDraft,
      fromAddress: r.fromAddress,
      fromLat: r.fromLat,
      fromLon: r.fromLon,
      toAddress: r.toAddress,
      toLat: r.toLat,
      toLon: r.toLon
    })
    navigate(bookPath(user.role), { state: { step: 'when' } })
  }

  const card = (ride: RideResponse) => (
    <PassengerRideCard
      key={ride.id}
      ride={ride}
      token={token}
      userId={user.id}
      onToast={onToast}
      onChanged={load}
      onDelete={deleteRide}
      onOpen={(id) => navigate(`/app/resa/${id}`)}
    />
  )

  return (
    <div className="subpage-wrap stack">
      <h1 className="page-title">{t('tabs.rides')}</h1>
      {failed && <p className="notice">{t('lastUpdated.stale')}</p>}
      {rides === null && !failed && <p className="muted">{t('common.loading')}</p>}
      {rides !== null && (
        <>
          <Section title={t('rides.groupOngoing')} empty={t('rides.noOngoing')} count={groups.ongoing.length}>
            {groups.ongoing.map(card)}
          </Section>
          <Section title={t('rides.groupUpcoming')} empty={t('rides.noUpcoming')} count={groups.upcoming.length}>
            {groups.upcoming.map(card)}
          </Section>
          <Section title={t('rides.groupPast')} empty={t('rides.noHistory')} count={groups.past.length}>
            {groups.past.map((r) => (
              <PastRideRow
                key={r.id}
                ride={r}
                perspective="passenger"
                onRate={setRateId}
                onDelete={deleteRide}
                onRebook={rebook}
                onSavePlace={canSave(r) ? (x) => setSavingPlace({ name: x.toAddress, address: x.toAddress, lat: x.toLat, lon: x.toLon }) : undefined}
              />
            ))}
          </Section>
        </>
      )}
      <SavePlaceSheet
        open={savingPlace !== null}
        place={savingPlace}
        token={token}
        onClose={() => setSavingPlace(null)}
        onSaved={() => void saved.reload()}
        onToast={onToast}
      />
      <RatingSheet
        open={rateId !== null}
        onClose={() => setRateId(null)}
        onSubmit={async (stars, comment) => {
          try {
            await api(`/api/rides/${rateId}/feedback`, {
              method: 'POST',
              token,
              body: JSON.stringify({ stars, comment: comment || undefined })
            })
            setRides((rs) => rs && rs.map((r) => (r.id === rateId ? { ...r, feedbackGiven: true } : r)))
            onToast(t('rides.feedbackThanksToast'))
          } catch (err) {
            onToast(apiErrorMessage(err, t))
            throw err
          }
        }}
      />
    </div>
  )
}
