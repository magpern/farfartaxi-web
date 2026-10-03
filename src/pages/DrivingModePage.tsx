import { useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '../i18n/context'
import { useRide } from '../lib/useRide'
import { DRIVER_MESSAGE_CODES, hasAction } from '../lib/rideTypes'
import { useRideMessages } from '../lib/rideMessages'
import { formatHm } from '../lib/time'
import { NavigateButton } from '../components/NavigateButton'
import { shortPlaceName } from '../lib/navigation'
import { ContactButtons } from '../components/ContactButtons'
import { DriverDialogs } from '../components/DriverRideCard'
import { LastUpdated } from '../components/LastUpdated'
import { QuickMessages } from '../components/QuickMessages'
import { RideMessages } from '../components/RideMessages'
import { DRIVER_STEPS, useDriverRideActions } from '../components/rideActions'
import { Button, Card } from '../components/ui'
import { useActiveRide } from '../shell/ActiveRide'
import { useShell } from '../shell/ShellContext'

export function DrivingModePage() {
  const { id } = useParams()
  return <DrivingScreen key={id} id={id} />
}

function DrivingScreen({ id }: { id: string | undefined }) {
  const { t } = useI18n()
  const { token, user, onToast } = useShell()
  const navigate = useNavigate()
  const { refresh: refreshActive } = useActiveRide()
  const { ride, lastUpdated, failed, gone, loading, refresh } = useRide(id, token, user.id)

  const onChanged = async () => {
    await refresh()
    await refreshActive()
  }
  if (!ride) {
    return (
      <div className="subpage-wrap stack">
        <Card>
          <p>{gone ? t('activeRide.gone') : loading ? t('common.loading') : t('activeRide.unreachable')}</p>
          <Button variant="primary" size="lg" onClick={() => navigate('/app/forare')}>
            {t('driving.back')}
          </Button>
        </Card>
      </div>
    )
  }
  return (
    <DrivingBody
      ride={ride}
      token={token}
      userId={user.id}
      onToast={onToast}
      onChanged={onChanged}
      footer={<LastUpdated at={lastUpdated} failed={failed} />}
      onBack={() => navigate('/app/forare')}
    />
  )
}

function DrivingBody({
  ride,
  token,
  userId,
  onToast,
  onChanged,
  footer,
  onBack
}: {
  ride: import('../lib/rideTypes').RideResponse
  token: string
  userId: number
  onToast: (m: string) => void
  onChanged: () => Promise<void>
  footer: React.ReactNode
  onBack: () => void
}) {
  const { t } = useI18n()
  const messages = useRideMessages(ride, token)
  const a = useDriverRideActions({ ride, token, onToast, onChanged })
  const first = ride.passengerName?.split(' ')[0] || t('driver.passengerFallback')
  const step = DRIVER_STEPS.find((s) => s.action !== 'ACCEPT' && hasAction(ride, s.action))
  const finished = ride.status === 'COMPLETED' || ride.status === 'CANCELLED'
  const headlineStatus = ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'PICKED_UP', 'COMPLETED', 'CANCELLED'].includes(ride.status)
    ? ride.status
    : 'OTHER'
  // Where the next stop is: the pickup until the passenger is in the car, then the destination.
  const toDestination = ride.status === 'PICKED_UP'

  return (
    <div className="subpage-wrap stack driving-mode">
      <button type="button" className="link-back" onClick={onBack}>
        {t('driving.back')}
      </button>

      <Card tone="highlight">
        <h1 className="ride-headline">{t(`driving.headline.${headlineStatus}`, { name: first })}</h1>
        <p className="driving-stop-label">{toDestination ? t('driving.destination') : t('driving.pickup')}</p>
        <p className="driving-stop">{toDestination ? ride.toAddress : ride.fromAddress}</p>
        {!toDestination && <p className="muted">{t('driving.pickupTime', { time: formatHm(ride.scheduledAt) })}</p>}
        {toDestination ? null : (
          <p className="muted">
            {t('driving.thenTo')} {ride.toAddress}
          </p>
        )}
      </Card>

      {ride.pickupNote && !finished && (
        <p className="notice driving-note">
          <strong>{t('driving.noteFrom', { name: first })}</strong> {ride.pickupNote}
        </p>
      )}

      <RideMessages messages={messages} isMine={(m) => m.senderId === userId} otherName={first} />

      {step && (
        <Button variant="primary" size="huge" block disabled={a.busy} onClick={() => void a.simple(step.path, step.toastKey)}>
          {a.busy ? t('common.working') : t(step.labelKey)}
        </Button>
      )}
      {finished && (
        <Button variant="primary" size="huge" block onClick={onBack}>
          {t('driving.done')}
        </Button>
      )}

      {/* Hand-off to the maps app: the pickup until the passenger is in the car, then the destination. */}
      <div className="navigate-slot" data-slot="navigate">
        {!finished && (ride.status === 'EN_ROUTE' || ride.status === 'ARRIVED' || ride.status === 'PICKED_UP') && (
          <NavigateButton
            lat={toDestination ? ride.toLat : ride.fromLat}
            lon={toDestination ? ride.toLon : ride.fromLon}
            label={t('navigate.to', { place: toDestination ? shortPlaceName(ride.toAddress) : first })}
          />
        )}
      </div>

      {!finished && <ContactButtons phone={ride.passengerPhone} name={first} prefilledSms={t('messages.DRIVER_HERE')} callWithName />}

      {hasAction(ride, 'MESSAGE') && (
        <QuickMessages codes={DRIVER_MESSAGE_CODES} large disabled={a.busy} onSend={(c) => void a.sendMessage(c)} />
      )}

      {hasAction(ride, 'RETURN') && (
        <Button size="lg" block variant="ghost" disabled={a.busy} onClick={() => a.setReturning(true)}>
          {t('driver.giveBack')}
        </Button>
      )}
      {footer}
      <DriverDialogs a={a} />
    </div>
  )
}
