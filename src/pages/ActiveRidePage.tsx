import { useState } from 'react'
import { haversine } from '../lib/geo'
import { useSavedPlaces } from '../lib/useSavedPlaces'
import { SavePlaceSheet } from '../components/SavePlaceSheet'
import type { PlaceDraft } from '../api/savedPlaces'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useI18n } from '../i18n/context'
import { apiErrorMessage } from '../lib/apiErrors'
import { rideHeadlineKey as headlineKey } from '../lib/rideStatus'
import { hasAction, PASSENGER_MESSAGE_CODES, type RideResponse } from '../lib/rideTypes'
import { useRideMessages } from '../lib/rideMessages'
import { formatWeekdayDateTime } from '../lib/time'
import { useRide } from '../lib/useRide'
import { isDrivingStatus, targetForStatus } from '../lib/liveTracking'
import { ContactButtons } from '../components/ContactButtons'
import { LastUpdated } from '../components/LastUpdated'
import { QuickMessages } from '../components/QuickMessages'
import { RatingSheet } from '../components/RatingSheet'
import { RideMessages } from '../components/RideMessages'
import { RideTimeEdit } from '../components/RideTimeEdit'
import { usePassengerRideActions } from '../components/rideActions'
import { LiveRideMap } from '../components/LiveRideMap'
import { LiveStatus } from '../components/LiveStatus'
import { ShareRideButton } from '../components/ShareRideButton'
import { Button, Card, ConfirmDialog } from '../components/ui'
import { useActiveRide } from '../shell/ActiveRide'
import { useShell } from '../shell/ShellContext'
import { bookPath } from '../shell/types'

export function ActiveRidePage() {
  const { id } = useParams()
  return <ActiveRideScreen key={id} id={id} />
}

function ActiveRideScreen({ id }: { id: string | undefined }) {
  const { t, locale } = useI18n()
  const { token, user, onToast } = useShell()
  const navigate = useNavigate()
  const { refresh: refreshActive } = useActiveRide()
  const { ride, lastUpdated, failed, gone, loading, refresh } = useRide(id, token, user.id)
  const [rating, setRating] = useState(false)
  const [rated, setRated] = useState(false)

  if (!ride) {
    return (
      <div className="subpage-wrap stack">
        <Card>
          <p>{gone ? t('activeRide.gone') : loading ? t('common.loading') : t('activeRide.unreachable')}</p>
          <Button variant="primary" onClick={() => navigate(bookPath(user.role))}>
            {t('activeRide.toHome')}
          </Button>
        </Card>
      </div>
    )
  }

  const onChanged = async () => {
    await refresh()
    await refreshActive()
  }

  return (
    <div className="subpage-wrap stack ride-screen">
      <RideBody
        ride={ride}
        token={token}
        userId={user.id}
        locale={locale}
        onToast={onToast}
        onChanged={onChanged}
        canRate={!ride.feedbackGiven && !rated}
        onRate={() => setRating(true)}
        onHome={() => navigate(bookPath(user.role))}
      />
      <LastUpdated at={lastUpdated} failed={failed} />
      <RatingSheet
        open={rating}
        onClose={() => setRating(false)}
        onSubmit={async (stars, comment) => {
          try {
            await api(`/api/rides/${ride.id}/feedback`, {
              method: 'POST',
              token,
              body: JSON.stringify({ stars, comment: comment || undefined })
            })
            setRated(true)
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

function RideBody({
  ride,
  token,
  userId,
  locale,
  onToast,
  onChanged,
  canRate,
  onRate,
  onHome
}: {
  ride: RideResponse
  token: string
  userId: number
  locale: string
  onToast: (m: string) => void
  onChanged: () => Promise<void>
  canRate: boolean
  onRate: () => void
  onHome: () => void
}) {
  const { t } = useI18n()
  const dateLocale = locale === 'en' ? 'en-GB' : 'sv-SE'
  const messages = useRideMessages(ride, token)
  const a = usePassengerRideActions({ ride, token, onToast, onChanged })
  const driverFirst = ride.acceptedByDriverName?.split(' ')[0] || t('messages.driverName')
  const cancelAction = hasAction(ride, 'CANCEL') || hasAction(ride, 'CANCEL_CONFIRM')
  const needsConfirm = hasAction(ride, 'CANCEL_CONFIRM')
  const finished = ride.status === 'COMPLETED' || ride.status === 'CANCELLED'
  const saved = useSavedPlaces(token)
  const [savingPlace, setSavingPlace] = useState<PlaceDraft | null>(null)
  const alreadySaved = (saved.places ?? []).some((p) => haversine(p.lat, p.lon, ride.toLat, ride.toLon) < 0.03)
  const canSavePlace = ride.status === 'COMPLETED' && ride.passengerId === userId && saved.places !== null && !alreadySaved
  const showMap = ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'PICKED_UP'].includes(ride.status)
  const canShare = ['REQUESTED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'PICKED_UP'].includes(ride.status)
  const hasDriver = !!ride.acceptedByDriverName && ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'PICKED_UP', 'COMPLETED'].includes(ride.status)

  return (
    <>
      <Card tone="highlight" className="ride-hero">
        <h1 className="ride-headline">{t(headlineKey(ride.status), { name: driverFirst })}</h1>
        {ride.etaMinutes != null && ride.etaMinutes > 0 && !finished && !isDrivingStatus(ride.status) && <p className="ride-eta">{t('rides.eta', { min: ride.etaMinutes })}</p>}
        <p className="ride-time">{formatWeekdayDateTime(ride.scheduledAt, dateLocale)}</p>
        <p className="ride-route">
          <strong>{ride.fromAddress}</strong>
          <span className="ride-arrow" aria-label={t('rides.toWord')}>
            {' → '}
          </span>
          <strong>{ride.toAddress}</strong>
        </p>
        {ride.status === 'NO_DRIVER' && <p>{t('rides.noDriverHint')}</p>}
        {a.materialNotice && <p className="notice">{t('rides.editMaterial')}</p>}
      </Card>

      {hasDriver && (
        <Card className="driver-card">
          {ride.driverPhotoUrl ? (
            <img className="driver-photo" src={ride.driverPhotoUrl} alt="" />
          ) : (
            <div className="driver-photo driver-photo-fallback" aria-hidden>
              {driverFirst.slice(0, 1)}
            </div>
          )}
          <div className="driver-card-info">
            <strong>{ride.acceptedByDriverName}</strong>
            {ride.driverVehicleNote && <div className="muted">{ride.driverVehicleNote}</div>}
          </div>
        </Card>
      )}

      {!finished && <ContactButtons phone={ride.driverPhone} name={driverFirst} />}

      {ride.pickupNote && !finished && <p className="tiny">{t('pickupNote.show', { note: ride.pickupNote })}</p>}

      {isDrivingStatus(ride.status) && (
        <LiveStatus
          status={ride.status}
          etaTarget={ride.etaTarget}
          etaMinutes={ride.etaMinutes}
          lastLocationAt={ride.lastLocationAt}
          locationStale={ride.locationStale}
          name={driverFirst}
        />
      )}
      <div className="live-map-slot" data-slot="live-map">
        {showMap && (
          <LiveRideMap
            pickup={{ lat: ride.fromLat, lon: ride.fromLon }}
            destination={{ lat: ride.toLat, lon: ride.toLon }}
            target={ride.status === 'PICKED_UP' ? 'DESTINATION' : targetForStatus(ride.status)}
            car={
              ride.lastDriverLat != null && ride.lastDriverLon != null && isDrivingStatus(ride.status)
                ? { lat: ride.lastDriverLat, lon: ride.lastDriverLon, accuracyM: ride.lastLocationAccuracyM }
                : null
            }
          />
        )}
      </div>

      <RideMessages messages={messages} isMine={(m) => m.senderId === userId} otherName={driverFirst} />
      {hasAction(ride, 'MESSAGE') && (
        <QuickMessages codes={PASSENGER_MESSAGE_CODES} disabled={a.busy} onSend={(c) => void a.sendMessage(c)} />
      )}

      <div className="ride-actions-col">
        {hasAction(ride, 'KEEP_WAITING') && (
          <Button variant="primary" size="lg" block disabled={a.busy} onClick={() => void a.keepWaiting()}>
            {t('rides.keepWaiting')}
          </Button>
        )}
        {hasAction(ride, 'EDIT') && (
          <Button size="lg" block disabled={a.busy} onClick={() => a.setEditing(true)}>
            {t('rides.editTime')}
          </Button>
        )}
        {cancelAction && (
          <Button variant="danger" size="lg" block disabled={a.busy} onClick={() => (needsConfirm ? a.setConfirmCancel(true) : void a.cancelRide(false))}>
            {t('rides.cancel')}
          </Button>
        )}
        {canShare && <ShareRideButton rideId={ride.id} token={token} onToast={onToast} />}
        {ride.status === 'COMPLETED' && canRate && (
          <Button variant="primary" size="lg" block onClick={onRate}>
            {t('rating.cta')}
          </Button>
        )}
        {canSavePlace && (
          <Button
            size="lg"
            block
            onClick={() => setSavingPlace({ name: ride.toAddress, address: ride.toAddress, lat: ride.toLat, lon: ride.toLon })}
          >
            ⭐ {t('places.saveAsPlace')}
          </Button>
        )}
        {finished && (
          <Button size="lg" block onClick={onHome}>
            {t('activeRide.bookNew')}
          </Button>
        )}
      </div>

      <SavePlaceSheet
        open={savingPlace !== null}
        place={savingPlace}
        token={token}
        onClose={() => setSavingPlace(null)}
        onSaved={() => void saved.reload()}
        onToast={onToast}
      />
      <ConfirmDialog
        open={a.confirmCancel}
        danger
        title={t('rides.cancelConfirmTitle')}
        body={t('rides.cancelConfirmBody')}
        confirmLabel={t('rides.cancelConfirmYes')}
        cancelLabel={t('rides.cancelConfirmNo')}
        busy={a.busy}
        onCancel={() => a.setConfirmCancel(false)}
        onConfirm={() => void a.cancelRide(true)}
      />
      {a.editing && (
        <RideTimeEdit open token={token} ride={ride} busy={a.busy} onCancel={() => a.setEditing(false)} onSave={(patch) => void a.saveEdit(patch)} />
      )}
    </>
  )
}
