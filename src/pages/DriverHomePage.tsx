import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useI18n } from '../i18n/context'
import { groupDriverRides } from '../lib/rideGroups'
import { DRIVING_STATUSES, type RideResponse } from '../lib/rideTypes'
import { ActiveRideCard } from '../components/ActiveRideCard'
import { AvailabilityToggle, AwayDates } from '../components/DriverAvailability'
import { useAvailability } from '../lib/useAvailability'
import { DriverRideCard } from '../components/DriverRideCard'
import { LastUpdated } from '../components/LastUpdated'
import { NotificationPrompt } from '../components/NotificationPrompt'
import { Button, Card } from '../components/ui'
import { useActiveRide } from '../shell/ActiveRide'
import { useShell } from '../shell/ShellContext'

/** Driver home: availability toggle, ride in progress / next ride, new requests (urgent first), today's rides, away dates. */
export function DriverHomePage() {
  const { t } = useI18n()
  const { token, user, onToast } = useShell()
  const navigate = useNavigate()
  const { active, refresh: refreshActive } = useActiveRide()
  const availability = useAvailability(token, onToast)
  const [mine, setMine] = useState<RideResponse[]>([])
  const [open, setOpen] = useState<RideResponse[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const [m, o] = await Promise.all([
        api<RideResponse[]>('/api/driver/rides/mine', { token }),
        api<RideResponse[]>('/api/driver/rides/open', { token })
      ])
      setMine(m)
      setOpen([...o].sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent)))
      setFailed(false)
      setLastUpdated(Date.now())
    } catch {
      setFailed(true) // keep the last known lists; the next poll retries
    } finally {
      setLoaded(true)
    }
  }, [token])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 10000)
    const onVis = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [load])

  const onChanged = useCallback(async () => {
    await load()
    await refreshActive()
  }, [load, refreshActive])

  const today = useMemo(() => groupDriverRides(mine, []).today, [mine])
  const driverActive = active?.role === 'DRIVER' ? active.ride : null
  const driving = driverActive && DRIVING_STATUSES.includes(driverActive.status)
  const todayRest = today.filter((r) => r.id !== driverActive?.id)
  const passengerFirst = (r: RideResponse) => r.passengerName?.split(' ')[0] || t('driver.passengerFallback')

  return (
    <div className="subpage-wrap stack driver-home">
      <AvailabilityToggle state={availability} />
      <h1 className="page-title">{t('tabs.requests')}</h1>
      <NotificationPrompt />

      {driverActive && (
        <ActiveRideCard
          ride={driverActive}
          size="huge"
          title={
            driving
              ? t(`driving.headline.${driverActive.status}`, { name: passengerFirst(driverActive) })
              : t('driver.nextRide', { name: passengerFirst(driverActive) })
          }
          openLabel={driving ? t('driver.continueDriving') : t('driver.openDriving')}
          onOpen={() => navigate(`/app/forare/kor/${driverActive.id}`)}
        />
      )}

      <Card>
        <h2 className="section-title">{t('driver.openRides')}</h2>
        {!loaded && <p className="muted">{t('common.loading')}</p>}
        {loaded && open.length === 0 && <p className="muted">{t('driver.noOpenRides')}</p>}
        {open.map((ride) => (
          <DriverRideCard key={ride.id} ride={ride} token={token} userId={user.id} onToast={onToast} onChanged={onChanged} />
        ))}
      </Card>

      <Card>
        <h2 className="section-title">{t('driver.todayRides')}</h2>
        {loaded && todayRest.length === 0 && <p className="muted">{t('driver.noTodayRides')}</p>}
        {todayRest.map((ride) => (
          <DriverRideCard
            key={ride.id}
            ride={ride}
            token={token}
            userId={user.id}
            onToast={onToast}
            onChanged={onChanged}
            onOpen={(id) => navigate(`/app/forare/kor/${id}`)}
          />
        ))}
        <Button block onClick={() => navigate('/app/resor')}>
          {t('driver.allMyRides')}
        </Button>
      </Card>

      <Button size="lg" block onClick={() => navigate('/app/boka')}>
        {t('driver.bookRide')}
      </Button>

      <AwayDates state={availability} />

      <LastUpdated at={lastUpdated} failed={failed} />
    </div>
  )
}
