import { useI18n } from '../i18n/context'
import { hasAction, PASSENGER_MESSAGE_CODES, smsHref, telHref, type RideResponse } from '../lib/rideTypes'
import { formatWeekdayDateTime } from '../lib/time'
import { useRideMessages } from '../lib/rideMessages'
import { QuickMessages } from './QuickMessages'
import { RideMessages } from './RideMessages'
import { RideTimeEdit } from './RideTimeEdit'
import { usePassengerRideActions } from './rideActions'
import { Button } from './ui/Button'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { StatusPill } from './ui/StatusPill'

type Props = {
  ride: RideResponse
  token: string
  /** Current user's id, used to attribute chat messages. */
  userId: number
  onToast: (m: string) => void
  /** Reload the ride lists (called after every action, success or failure). */
  onChanged: () => Promise<void> | void
  onShare?: (rideId: number) => void
  onDelete?: (rideId: number) => void
  /** Open the full ride screen. */
  onOpen?: (rideId: number) => void
}

/** Passenger view of one ride. Every button comes from `ride.availableActions`, never from status checks. */
export function PassengerRideCard({ ride, token, userId, onToast, onChanged, onShare, onDelete, onOpen }: Props) {
  const { t, locale } = useI18n()
  const dateLocale = locale === 'en' ? 'en-GB' : 'sv-SE'
  const messages = useRideMessages(ride, token)
  const a = usePassengerRideActions({ ride, token, onToast, onChanged })
  const cancelAction = hasAction(ride, 'CANCEL') || hasAction(ride, 'CANCEL_CONFIRM')
  const needsConfirm = hasAction(ride, 'CANCEL_CONFIRM')
  const noDriver = ride.status === 'NO_DRIVER'

  return (
    <article className="ride-item">
      <p className="ride-item-head">
        <StatusPill status={ride.status} />
      </p>
      <p>
        <strong>{ride.fromAddress}</strong> {t('rides.toWord')} <strong>{ride.toAddress}</strong>
      </p>
      <p>{formatWeekdayDateTime(ride.scheduledAt, dateLocale)}</p>
      {noDriver && <p>{t('rides.noDriverHint')}</p>}
      {ride.pickupNote && <p className="tiny">{t('pickupNote.show', { note: ride.pickupNote })}</p>}
      {ride.acceptedByDriverName && <p>{t('rides.driver', { name: ride.acceptedByDriverName })}</p>}
      {ride.driverVehicleNote && <p className="tiny">{t('rides.vehicle', { note: ride.driverVehicleNote })}</p>}
      {ride.etaMinutes ? <p>{t('rides.eta', { min: ride.etaMinutes })}</p> : null}
      {a.materialNotice && <p className="notice">{t('rides.editMaterial')}</p>}
      <div className="row ride-actions">
        {onOpen && (
          <Button variant="primary" onClick={() => onOpen(ride.id)}>
            {t('rides.open')}
          </Button>
        )}
        {ride.driverPhone && (
          <>
            <Button variant="primary" href={telHref(ride.driverPhone)}>
              {t('rides.callDriver')}
            </Button>
            <Button href={smsHref(ride.driverPhone)}>{t('rides.smsDriver')}</Button>
          </>
        )}
        {hasAction(ride, 'KEEP_WAITING') && (
          <Button variant="primary" disabled={a.busy} onClick={() => void a.keepWaiting()}>
            {t('rides.keepWaiting')}
          </Button>
        )}
        {hasAction(ride, 'EDIT') && (
          <Button disabled={a.busy} onClick={() => a.setEditing(true)}>
            {t('rides.editTime')}
          </Button>
        )}
        {cancelAction && (
          <Button variant="danger" disabled={a.busy} onClick={() => (needsConfirm ? a.setConfirmCancel(true) : void a.cancelRide(false))}>
            {t('rides.cancel')}
          </Button>
        )}
        {onShare && ride.status !== 'COMPLETED' && ride.status !== 'CANCELLED' && (
          <Button onClick={() => onShare(ride.id)}>{t('rides.shareTrip')}</Button>
        )}
        {onDelete && ride.status === 'CANCELLED' && (
          <Button variant="danger" onClick={() => onDelete(ride.id)}>
            {t('rides.delete')}
          </Button>
        )}
      </div>
      <RideMessages
        messages={messages}
        isMine={(m) => m.senderId === userId}
        otherName={ride.acceptedByDriverName?.split(' ')[0] || t('messages.driverName')}
      />
      {hasAction(ride, 'MESSAGE') && (
        <QuickMessages codes={PASSENGER_MESSAGE_CODES} disabled={a.busy} onSend={(c) => void a.sendMessage(c)} />
      )}
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
    </article>
  )
}
