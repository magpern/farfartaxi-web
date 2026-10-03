import { useState } from 'react'
import { api, ApiError } from '../api/client'
import { useI18n } from '../i18n/context'
import { apiErrorMessage } from '../lib/apiErrors'
import { rideStatusLabel } from '../lib/rideStatus'
import { DRIVER_MESSAGE_CODES, hasAction, telHref, type RideAction, type RideResponse } from '../lib/rideTypes'
import { formatDateTime, formatHm } from '../lib/time'
import { useBusy } from '../lib/useBusy'
import { ConfirmDialog } from './ConfirmDialog'
import { QuickMessages } from './QuickMessages'

type Props = {
  ride: RideResponse
  token: string
  onToast: (m: string) => void
  /** Reload the ride lists (called after every action, success or failure). */
  onChanged: () => Promise<void> | void
}

/** Progress/primary actions in the order a driver meets them, mapped to endpoint + toast key. */
const PRIMARY: Array<{ action: RideAction; path: string; labelKey: string; toastKey?: string }> = [
  { action: 'ACCEPT', path: 'accept', labelKey: 'driver.takeRide', toastKey: 'driver.toastAccepted' },
  { action: 'START', path: 'start', labelKey: 'driver.driveNow', toastKey: 'driver.toastStartDriving' },
  { action: 'ARRIVE', path: 'arrive', labelKey: 'driver.arrived' },
  { action: 'PICKUP', path: 'pickup', labelKey: 'driver.pickedUp' },
  { action: 'COMPLETE', path: 'complete', labelKey: 'driver.complete', toastKey: 'driver.toastComplete' }
]

export function DriverRideCard({ ride, token, onToast, onChanged }: Props) {
  const { t, locale } = useI18n()
  const dateLocale = locale === 'en' ? 'en-GB' : 'sv-SE'
  const { busy, run } = useBusy()
  const [proximity, setProximity] = useState<{ time: string | null } | null>(null)
  const [returning, setReturning] = useState(false)
  const [reason, setReason] = useState('')

  const act = (fn: () => Promise<void>) =>
    run(async () => {
      try {
        await fn()
      } catch (err) {
        if (err instanceof ApiError && err.code === 'PROXIMITY_WARNING') {
          const conflicting = err.body?.conflictingRide as { scheduledAt?: string } | undefined
          setProximity({ time: conflicting?.scheduledAt ? formatHm(conflicting.scheduledAt) : null })
        } else {
          onToast(apiErrorMessage(err, t))
        }
      } finally {
        try {
          await onChanged()
        } catch {
          /* the page's polling will retry */
        }
      }
    })

  const post = (path: string, body?: unknown) =>
    api(`/api/driver/rides/${ride.id}/${path}`, {
      method: 'POST',
      token,
      body: body === undefined ? undefined : JSON.stringify(body)
    })

  const accept = (confirmProximity: boolean) =>
    act(async () => {
      await post('accept', confirmProximity ? { confirmProximity: true } : undefined)
      setProximity(null)
      onToast(t('driver.toastAccepted'))
    })

  const simple = (path: string, toastKey?: string) =>
    act(async () => {
      await post(path)
      if (toastKey) onToast(t(toastKey))
    })

  const decline = () =>
    act(async () => {
      await post('decline', { comment: t('driver.refuseComment') })
      onToast(t('driver.toastRefused'))
    })

  const giveBack = () =>
    act(async () => {
      const text = reason.trim()
      await post('return', text ? { reason: text } : {})
      setReturning(false)
      setReason('')
      onToast(t('driver.toastReturned'))
    })

  const reasonRequired = ride.status === 'EN_ROUTE'
  const hasProgress = PRIMARY.some((p) => hasAction(ride, p.action))

  return (
    <article className={`ride-item ${ride.urgent ? 'ride-urgent' : ''}`}>
      {ride.urgent && <p className="badge-urgent">{t('driver.urgent')}</p>}
      <p>
        <strong>{ride.fromAddress}</strong> {t('rides.toWord')} <strong>{ride.toAddress}</strong>
      </p>
      <p>
        {formatDateTime(ride.scheduledAt, dateLocale)} —{' '}
        <strong>{rideStatusLabel(t, ride.status, 'driver')}</strong>
      </p>
      {ride.passengerName && <p>{t('driver.passenger', { name: ride.passengerName })}</p>}
      {ride.pickupNote && <p className="tiny">{t('pickupNote.show', { note: ride.pickupNote })}</p>}
      {ride.etaMinutes != null && ride.etaMinutes > 0 && <p>{t('rides.eta', { min: ride.etaMinutes })}</p>}
      <div className="row ride-actions">
        {PRIMARY.filter((p) => hasAction(ride, p.action)).map((p) => (
          <button
            key={p.action}
            type="button"
            className="btn btn-driver btn-primary"
            disabled={busy}
            onClick={() => (p.action === 'ACCEPT' ? void accept(false) : void simple(p.path, p.toastKey))}
          >
            {busy ? t('common.working') : t(p.labelKey)}
          </button>
        ))}
        {hasAction(ride, 'DECLINE') && (
          <button
            type="button"
            className={`btn btn-driver ${hasProgress ? '' : 'btn-outline'}`}
            disabled={busy}
            onClick={() => void decline()}
          >
            {t('driver.cannot')}
          </button>
        )}
        {hasAction(ride, 'RETURN') && (
          <button type="button" className="btn btn-driver" disabled={busy} onClick={() => setReturning(true)}>
            {t('driver.giveBack')}
          </button>
        )}
        {ride.passengerPhone && (
          <a className="btn btn-driver" href={telHref(ride.passengerPhone)}>
            {t('driver.callPassenger')}
          </a>
        )}
      </div>
      {hasAction(ride, 'MESSAGE') && (
        <QuickMessages
          codes={DRIVER_MESSAGE_CODES}
          large
          disabled={busy}
          onSend={(code) =>
            void act(async () => {
              await api(`/api/rides/${ride.id}/messages`, { method: 'POST', token, body: JSON.stringify({ code }) })
              onToast(t('messages.sentToast'))
            })
          }
        />
      )}
      <ConfirmDialog
        open={proximity !== null}
        title={t('driver.proximityTitle')}
        body={
          proximity?.time ? t('driver.proximityBody', { time: proximity.time }) : t('driver.proximityBodyNoTime')
        }
        confirmLabel={t('driver.proximityYes')}
        cancelLabel={t('common.cancel')}
        busy={busy}
        onCancel={() => setProximity(null)}
        onConfirm={() => void accept(true)}
      />
      <ConfirmDialog
        open={returning}
        title={t('driver.returnTitle')}
        confirmLabel={t('driver.returnYes')}
        cancelLabel={t('common.cancel')}
        busy={busy}
        confirmDisabled={reasonRequired && reason.trim() === ''}
        onCancel={() => setReturning(false)}
        onConfirm={() => void giveBack()}
      >
        <textarea
          className="sheet-input"
          rows={2}
          maxLength={200}
          value={reason}
          aria-label={reasonRequired ? t('driver.returnReasonRequired') : t('driver.returnReasonOptional')}
          placeholder={reasonRequired ? t('driver.returnReasonRequired') : t('driver.returnReasonOptional')}
          onChange={(e) => setReason(e.target.value)}
        />
      </ConfirmDialog>
    </article>
  )
}
