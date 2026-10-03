import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n/context'
import { ActiveRideCard } from '../components/ActiveRideCard'
import { NotificationPrompt } from '../components/NotificationPrompt'
import { Button } from '../components/ui'
import { useActiveRide } from '../shell/ActiveRide'
import { useBookingDraft } from '../shell/BookingDraftContext'
import { rideHeadlineKey as headlineKey } from '../lib/rideStatus'
import { draftInProgress } from '../lib/bookingDraft'
import { BookingPage } from './BookingPage'

/**
 * Passenger home. An active ride is shown prominently on top, but booking is NEVER blocked by it:
 * "Boka en till resa" reveals the booking form (and /app/boka shows it straight away).
 */
export function HomePage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { active } = useActiveRide()
  const { draft } = useBookingDraft()
  const [revealed, setRevealed] = useState(false)
  const ride = active && active.role === 'PASSENGER' ? active.ride : null
  const showForm = !ride || revealed || pathname.replace(/\/+$/, '') === '/app/boka' || draftInProgress(draft)
  const first = ride?.acceptedByDriverName?.split(' ')[0] || t('messages.driverName')
  // One stable tree: the booking form (map, draft) must not remount when the ride card appears/disappears.
  return (
    <div className={ride ? 'subpage-wrap stack' : undefined}>
      <NotificationPrompt />
      {ride && (
        <>
          <ActiveRideCard
            ride={ride}
            title={t(headlineKey(ride.status), { name: first })}
            openLabel={t('activeRide.open')}
            onOpen={() => navigate(`/app/resa/${ride.id}`)}
          />
          {!showForm && (
            <Button size="lg" block onClick={() => setRevealed(true)}>
              {t('activeRide.bookAnother')}
            </Button>
          )}
        </>
      )}
      {showForm && <BookingPage />}
    </div>
  )
}
