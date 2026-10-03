import { useI18n } from '../i18n/context'
import { DRIVER_MESSAGE_CODES, hasAction, smsHref, telHref, type RideResponse } from '../lib/rideTypes'
import { formatWeekdayDateTime } from '../lib/time'
import { useRideMessages } from '../lib/rideMessages'
import { MiniMap } from './MiniMap'
import { QuickMessages } from './QuickMessages'
import { RideMessages } from './RideMessages'
import { DRIVER_STEPS, useDriverRideActions } from './rideActions'
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
  /** Open driving mode for this ride. */
  onOpen?: (rideId: number) => void
}

/** Driver request/ride card: big text, big buttons. Buttons come from `ride.availableActions`. */
export function DriverRideCard({ ride, token, userId, onToast, onChanged, onOpen }: Props) {
  const { t, locale } = useI18n()
  const dateLocale = locale === 'en' ? 'en-GB' : 'sv-SE'
  const messages = useRideMessages(ride, token)
  const a = useDriverRideActions({ ride, token, onToast, onChanged })
  const hasProgress = DRIVER_STEPS.some((p) => hasAction(ride, p.action))
  const isRequest = hasAction(ride, 'ACCEPT')
  const firstName = ride.passengerName?.split(' ')[0] || t('driver.passengerFallback')

  return (
    <article className={`ride-item driver-ride ${ride.urgent ? 'ride-urgent' : ''}`}>
      {(ride.urgent || ride.offerPriority) && (
        <p className="driver-badges">
          {ride.urgent && <span className="badge-urgent">{t('driver.urgent')}</span>}
          {ride.offerPriority && <span className="badge-priority">{t('driver.priority')}</span>}
        </p>
      )}
      <p className="driver-ride-who">
        {ride.passengerName ? t('driver.passenger', { name: ride.passengerName }) : t('driver.passengerFallback')}
      </p>
      <p className="driver-ride-when">{formatWeekdayDateTime(ride.scheduledAt, dateLocale)}</p>
      <p className="driver-ride-route">
        <strong>{ride.fromAddress}</strong> {t('rides.toWord')} <strong>{ride.toAddress}</strong>
      </p>
      {isRequest && (
        <MiniMap fromLat={ride.fromLat} fromLon={ride.fromLon} toLat={ride.toLat} toLon={ride.toLon} label={t('driver.mapAria')} />
      )}
      <p>
        <StatusPill status={ride.status} perspective="driver" />
      </p>
      {ride.offerPriority && (
        <p className="notice" role="status">
          {t('driver.changedRide', { name: firstName })}
        </p>
      )}
      {ride.pickupNote && <p className="driver-note">{t('pickupNote.show', { note: ride.pickupNote })}</p>}
      {ride.etaMinutes != null && ride.etaMinutes > 0 && <p>{t('rides.eta', { min: ride.etaMinutes })}</p>}
      <div className="row ride-actions">
        {DRIVER_STEPS.filter((p) => hasAction(ride, p.action)).map((p) => (
          <Button
            key={p.action}
            variant="primary"
            size="lg"
            disabled={a.busy}
            onClick={() => (p.action === 'ACCEPT' ? void a.accept(false) : void a.simple(p.path, p.toastKey))}
          >
            {a.busy ? t('common.working') : t(p.labelKey)}
          </Button>
        ))}
        {hasAction(ride, 'DECLINE') && (
          <Button size="lg" variant={hasProgress ? 'secondary' : 'ghost'} disabled={a.busy} onClick={() => void a.decline()}>
            {t('driver.cannot')}
          </Button>
        )}
        {onOpen && ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'PICKED_UP'].includes(ride.status) && (
          <Button size="lg" onClick={() => onOpen(ride.id)}>
            {t('driver.openDriving')}
          </Button>
        )}
        {ride.passengerPhone && (
          <>
            <Button size="lg" href={telHref(ride.passengerPhone)}>
              {t('driver.callPassenger')}
            </Button>
            <Button size="lg" href={smsHref(ride.passengerPhone)}>
              {t('driver.smsPassenger')}
            </Button>
          </>
        )}
      </div>
      {hasAction(ride, 'RETURN') && (
        <Button size="lg" block variant="ghost" className="give-back" disabled={a.busy} onClick={() => a.setReturning(true)}>
          {t('driver.giveBackRide')}
        </Button>
      )}
      <RideMessages messages={messages} isMine={(m) => m.senderId === userId} otherName={firstName} />
      {hasAction(ride, 'MESSAGE') && (
        <QuickMessages codes={DRIVER_MESSAGE_CODES} large disabled={a.busy} onSend={(c) => void a.sendMessage(c)} />
      )}
      <DriverDialogs a={a} />
    </article>
  )
}

/** Proximity warning + return dialogs, shared with driving mode. */
export function DriverDialogs({ a }: { a: ReturnType<typeof useDriverRideActions> }) {
  const { t } = useI18n()
  return (
    <>
      <ConfirmDialog
        open={a.proximity !== null}
        title={t('driver.proximityTitle')}
        body={a.proximity?.time ? t('driver.proximityBody', { time: a.proximity.time }) : t('driver.proximityBodyNoTime')}
        confirmLabel={t('driver.proximityYes')}
        cancelLabel={t('common.cancel')}
        busy={a.busy}
        onCancel={() => a.setProximity(null)}
        onConfirm={() => void a.accept(true)}
      />
      <ConfirmDialog
        open={a.returning}
        title={t('driver.returnTitle')}
        confirmLabel={t('driver.returnYes')}
        cancelLabel={t('common.cancel')}
        busy={a.busy}
        confirmDisabled={a.reasonRequired && a.reason.trim() === ''}
        onCancel={() => a.setReturning(false)}
        onConfirm={() => void a.giveBack()}
      >
        <textarea
          className="sheet-input"
          rows={2}
          maxLength={200}
          value={a.reason}
          aria-label={a.reasonRequired ? t('driver.returnReasonRequired') : t('driver.returnReasonOptional')}
          placeholder={a.reasonRequired ? t('driver.returnReasonRequired') : t('driver.returnReasonOptional')}
          onChange={(e) => a.setReason(e.target.value)}
        />
      </ConfirmDialog>
    </>
  )
}
