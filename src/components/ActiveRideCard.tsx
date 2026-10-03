import { useI18n } from '../i18n/context'
import type { RideResponse } from '../lib/rideTypes'
import { formatWeekdayDateTime } from '../lib/time'
import { Button, Card } from './ui'

/** Prominent "your active ride" card shown on Home instead of the booking form / next to the request list. */
export function ActiveRideCard({
  ride,
  title,
  openLabel,
  onOpen,
  size = 'lg'
}: {
  ride: RideResponse
  /** Big status line. */
  title: string
  openLabel: string
  onOpen: () => void
  size?: 'lg' | 'huge'
}) {
  const { locale } = useI18n()
  const dateLocale = locale === 'en' ? 'en-GB' : 'sv-SE'
  return (
    <Card tone="highlight" className="active-card">
      <h2 className="ride-headline">{title}</h2>
      <p className="ride-time">{formatWeekdayDateTime(ride.scheduledAt, dateLocale)}</p>
      <p className="ride-route">
        <strong>{ride.fromAddress}</strong>
        {' → '}
        <strong>{ride.toAddress}</strong>
      </p>
      <Button variant="primary" size={size} block onClick={onOpen}>
        {openLabel}
      </Button>
    </Card>
  )
}
