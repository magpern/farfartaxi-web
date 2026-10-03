import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useI18n } from '../i18n/context'
import { groupDriverRides } from '../lib/rideGroups'
import type { RideResponse } from '../lib/rideTypes'
import { DriverRideCard } from '../components/DriverRideCard'
import { Button } from '../components/ui'
import { pollWhileVisible } from '../lib/pollWhileVisible'
import { useShell } from '../shell/ShellContext'
import { PastRideRow, RidesPage, Section } from './RidesPage'

/** Drivers: Idag / Kommande / Tidigare for rides they drive; a switch shows rides they take as a passenger. */
export function DriverRidesPage() {
  const { t } = useI18n()
  const [mode, setMode] = useState<'drive' | 'ride'>('drive')
  return (
    <div className="stack">
      <div className="segmented" role="group" aria-label={t('tabs.rides')}>
        <Button variant={mode === 'drive' ? 'primary' : 'secondary'} aria-pressed={mode === 'drive'} onClick={() => setMode('drive')}>
          {t('driver.modeDrive')}
        </Button>
        <Button variant={mode === 'ride' ? 'primary' : 'secondary'} aria-pressed={mode === 'ride'} onClick={() => setMode('ride')}>
          {t('driver.modeRide')}
        </Button>
      </div>
      {mode === 'drive' ? <DriverRidesList /> : <RidesPage />}
    </div>
  )
}

function DriverRidesList() {
  const { t } = useI18n()
  const { token, user, onToast } = useShell()
  const navigate = useNavigate()
  const [mine, setMine] = useState<RideResponse[] | null>(null)
  const [history, setHistory] = useState<RideResponse[]>([])
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    try {
      const [m, h] = await Promise.all([
        api<RideResponse[]>('/api/driver/rides/mine', { token }),
        api<RideResponse[]>('/api/driver/rides/history', { token })
      ])
      setMine(m)
      setHistory(h)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [token])

  useEffect(() => {
    void load()
    return pollWhileVisible(load, 15000)
  }, [load])

  const groups = useMemo(() => groupDriverRides(mine ?? [], history), [mine, history])
  const card = (ride: RideResponse) => (
    <DriverRideCard key={ride.id} ride={ride} token={token} userId={user.id} onToast={onToast} onChanged={load} onOpen={(id) => navigate(`/app/forare/kor/${id}`)} />
  )

  return (
    <div className="subpage-wrap stack">
      <h1 className="page-title">{t('driver.myRides')}</h1>
      {failed && <p className="notice">{t('lastUpdated.stale')}</p>}
      {mine === null && !failed && <p className="muted">{t('common.loading')}</p>}
      {mine !== null && (
        <>
          <Section title={t('driver.groupToday')} empty={t('driver.noTodayRides')} count={groups.today.length}>
            {groups.today.map(card)}
          </Section>
          <Section title={t('driver.groupUpcoming')} empty={t('rides.noUpcoming')} count={groups.upcoming.length}>
            {groups.upcoming.map(card)}
          </Section>
          <Section title={t('driver.groupPast')} empty={t('rides.noHistory')} count={groups.past.length}>
            {groups.past.map((r) => (
              <PastRideRow key={r.id} ride={r} perspective="driver" />
            ))}
          </Section>
        </>
      )}
    </div>
  )
}
