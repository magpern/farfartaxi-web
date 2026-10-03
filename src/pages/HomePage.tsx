import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n/context'
import { ActiveRideCard } from '../components/ActiveRideCard'
import { useActiveRide } from '../shell/ActiveRide'
import { rideHeadlineKey as headlineKey } from '../lib/rideStatus'
import { BookingPage } from './BookingPage'

/** Passenger home. An active ride replaces the booking form with the ride card (the global invariant). */
export function HomePage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { active } = useActiveRide()
  if (active && active.role === 'PASSENGER') {
    const { ride } = active
    const first = ride.acceptedByDriverName?.split(' ')[0] || t('messages.driverName')
    return (
      <div className="subpage-wrap stack">
        <ActiveRideCard
          ride={ride}
          title={t(headlineKey(ride.status), { name: first })}
          openLabel={t('activeRide.open')}
          onOpen={() => navigate(`/app/resa/${ride.id}`)}
        />
      </div>
    )
  }
  return <BookingPage />
}
