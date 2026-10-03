import { useState } from 'react'
import { api } from '../api/client'
import { useI18n } from '../i18n/context'
import { apiErrorMessage, isApiCode } from '../lib/apiErrors'
import { rideStatusLabel } from '../lib/rideStatus'
import { hasAction, PASSENGER_MESSAGE_CODES, telHref, type RideResponse } from '../lib/rideTypes'
import { formatDateTime } from '../lib/time'
import { useBusy } from '../lib/useBusy'
import { ConfirmDialog } from './ConfirmDialog'
import { useRideMessages } from '../lib/rideMessages'
import { QuickMessages } from './QuickMessages'
import { RideMessages } from './RideMessages'
import { RideTimeEdit, type RidePatch } from './RideTimeEdit'

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
}

/** Passenger view of one ride. Every button comes from `ride.availableActions`, never from status checks. */
export function PassengerRideCard({ ride, token, userId, onToast, onChanged, onShare, onDelete }: Props) {
  const { t, locale } = useI18n()
  const dateLocale = locale === 'en' ? 'en-GB' : 'sv-SE'
  const { busy, run } = useBusy()
  const messages = useRideMessages(ride, token)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [editing, setEditing] = useState(false)
  const [materialNotice, setMaterialNotice] = useState(false)

  const act = (fn: () => Promise<void>) =>
    run(async () => {
      try {
        await fn()
      } catch (err) {
        if (isApiCode(err, 'CONFIRM_REQUIRED')) setConfirmCancel(true)
        else onToast(apiErrorMessage(err, t))
      } finally {
        try {
          await onChanged()
        } catch {
          /* list refresh failures are surfaced by the page's own polling */
        }
      }
    })

  const cancelRide = (confirm: boolean) =>
    act(async () => {
      const reason = ride.acceptedByDriverId ? t('rides.cancelReasonAfterAccept') : t('rides.cancelReason')
      await api(`/api/rides/${ride.id}/cancel`, {
        method: 'POST',
        token,
        body: JSON.stringify(confirm ? { reason, confirm: true } : { reason })
      })
      setConfirmCancel(false)
      onToast(t('rides.cancelledToast'))
    })

  const keepWaiting = () =>
    act(async () => {
      await api(`/api/rides/${ride.id}/keep-waiting`, { method: 'POST', token })
      onToast(t('rides.keepWaitingToast'))
    })

  const saveEdit = (patch: RidePatch) =>
    act(async () => {
      const updated = await api<RideResponse>(`/api/rides/${ride.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify(patch)
      })
      setEditing(false)
      if (updated?.lastEditMaterial) {
        setMaterialNotice(true)
        onToast(t('rides.editMaterial'))
      } else {
        onToast(t('rides.editSavedToast'))
      }
    })

  const sendMessage = (code: string) =>
    act(async () => {
      await api(`/api/rides/${ride.id}/messages`, { method: 'POST', token, body: JSON.stringify({ code }) })
      onToast(t('messages.sentToast'))
    })

  const cancelAction = hasAction(ride, 'CANCEL') || hasAction(ride, 'CANCEL_CONFIRM')
  const needsConfirm = hasAction(ride, 'CANCEL_CONFIRM')
  const noDriver = ride.status === 'NO_DRIVER'

  return (
    <article className="ride-item">
      <p>
        <strong>{ride.fromAddress}</strong> {t('rides.toWord')} <strong>{ride.toAddress}</strong>
      </p>
      <p>
        {formatDateTime(ride.scheduledAt, dateLocale)} -{' '}
        <strong>{rideStatusLabel(t, ride.status)}</strong>
      </p>
      {noDriver && <p>{t('rides.noDriverHint')}</p>}
      {ride.pickupNote && <p className="tiny">{t('pickupNote.show', { note: ride.pickupNote })}</p>}
      {ride.acceptedByDriverName && <p>{t('rides.driver', { name: ride.acceptedByDriverName })}</p>}
      {ride.driverVehicleNote && <p className="tiny">{t('rides.vehicle', { note: ride.driverVehicleNote })}</p>}
      {ride.etaMinutes ? <p>{t('rides.eta', { min: ride.etaMinutes })}</p> : null}
      {materialNotice && <p className="notice">{t('rides.editMaterial')}</p>}
      <div className="row ride-actions">
        {ride.driverPhone && (
          <a className="btn btn-touch btn-primary" href={telHref(ride.driverPhone)}>
            {t('rides.callDriver')}
          </a>
        )}
        {hasAction(ride, 'KEEP_WAITING') && (
          <button type="button" className="btn btn-touch btn-primary" disabled={busy} onClick={keepWaiting}>
            {t('rides.keepWaiting')}
          </button>
        )}
        {hasAction(ride, 'EDIT') && (
          <button type="button" className="btn btn-touch" disabled={busy} onClick={() => setEditing(true)}>
            {t('rides.editTime')}
          </button>
        )}
        {cancelAction && (
          <button
            type="button"
            className="btn btn-touch btn-danger"
            disabled={busy}
            onClick={() => (needsConfirm ? setConfirmCancel(true) : void cancelRide(false))}
          >
            {t('rides.cancel')}
          </button>
        )}
        {onShare && ride.status !== 'COMPLETED' && ride.status !== 'CANCELLED' && (
          <button type="button" className="btn btn-touch" onClick={() => onShare(ride.id)}>
            {t('rides.shareTrip')}
          </button>
        )}
        {onDelete && ride.status === 'CANCELLED' && (
          <button type="button" className="btn btn-touch btn-danger" onClick={() => onDelete(ride.id)}>
            {t('rides.delete')}
          </button>
        )}
      </div>
      <RideMessages
        messages={messages}
        isMine={(m) => m.senderId === userId}
        otherName={ride.acceptedByDriverName?.split(' ')[0] || t('messages.driverName')}
      />
      {hasAction(ride, 'MESSAGE') && (
        <QuickMessages codes={PASSENGER_MESSAGE_CODES} disabled={busy} onSend={sendMessage} />
      )}
      <ConfirmDialog
        open={confirmCancel}
        danger
        title={t('rides.cancelConfirmTitle')}
        body={t('rides.cancelConfirmBody')}
        confirmLabel={t('rides.cancelConfirmYes')}
        cancelLabel={t('rides.cancelConfirmNo')}
        busy={busy}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void cancelRide(true)}
      />
      {editing && (
        <RideTimeEdit
          open
          ride={ride}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSave={(patch) => void saveEdit(patch)}
        />
      )}
    </article>
  )
}
