import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { LiveRideMap } from '../components/LiveRideMap'
import { LiveStatus } from '../components/LiveStatus'
import { useI18n } from '../i18n/context'
import { targetForStatus, type EtaTarget } from '../lib/liveTracking'
import { pollWhileVisible } from '../lib/pollWhileVisible'
import { formatLastUpdated } from '../lib/network'

export type SharedRide = {
  passengerFirstName: string
  driverFirstName: string | null
  status: string
  scheduledAt: string
  pickup: { lat: number; lon: number; label: string }
  destination: { lat: number; lon: number; label: string }
  driver: { lat: number; lon: number; accuracyM?: number | null; updatedAt: string } | null
  etaMinutes: number | null
  etaTarget: EtaTarget | null
  locationStale: boolean
}

export const SHARE_POLL_MS = 10_000

type Load = { kind: 'loading' } | { kind: 'ok'; ride: SharedRide; at: number } | { kind: 'expired' } | { kind: 'missing' } | { kind: 'error' }

/** Public, logged-out view of one ride (`/dela/:token`). Never sends credentials and never touches the session. */
export function SharePage() {
  const { token = '' } = useParams()
  const { t } = useI18n()
  const [state, setState] = useState<Load>({ kind: 'loading' })
  const dead = useRef(false)

  const load = useCallback(async () => {
    try {
      const ride = await api<SharedRide>(`/api/public/share/${encodeURIComponent(token)}`)
      if (!dead.current) setState({ kind: 'ok', ride, at: Date.now() })
    } catch (err) {
      if (dead.current) return
      if (err instanceof ApiError && err.status === 410) setState({ kind: 'expired' })
      else if (err instanceof ApiError && err.status === 404) setState({ kind: 'missing' })
      else if (err instanceof ApiError && err.status === 429) return // rate limited: the next poll retries, silently
      else setState((s) => (s.kind === 'ok' ? s : { kind: 'error' })) // keep showing the last known ride
    }
  }, [token])

  useEffect(() => {
    dead.current = false
    void load()
    const stop = pollWhileVisible(load, SHARE_POLL_MS)
    return () => {
      dead.current = true
      stop()
    }
  }, [load])

  useEffect(() => {
    const prev = document.title
    document.title = t('common.brand')
    return () => {
      document.title = prev
    }
  }, [t])

  return (
    <main className="page share-page">
      <div className="share-wrap stack">
        {state.kind === 'loading' && <p className="muted">{t('common.loading')}</p>}
        {state.kind === 'error' && <p className="notice">{t('live.shareError')}</p>}
        {state.kind === 'expired' && (
          <section className="card">
            <h1>{t('live.shareExpired')}</h1>
            <p className="muted">{t('live.shareExpiredHint')}</p>
          </section>
        )}
        {state.kind === 'missing' && (
          <section className="card">
            <h1>{t('live.shareMissing')}</h1>
          </section>
        )}
        {state.kind === 'ok' && <SharedView shareToken={token} ride={state.ride} at={state.at} />}
      </div>
    </main>
  )
}

function SharedView({ ride, at, shareToken }: { ride: SharedRide; at: number; shareToken: string }) {
  const { t } = useI18n()
  const driver = ride.driverFirstName || t('live.defaultDriver')
  const target = ride.etaTarget ?? targetForStatus(ride.status)
  const finished = ride.status === 'COMPLETED' || ride.status === 'CANCELLED'
  return (
    <>
      <section className="card card-highlight">
        <h1 className="ride-headline">{t('live.shareHeader', { passenger: ride.passengerFirstName, driver })}</h1>
        {finished && <p>{t(`live.shareStatus.${ride.status === 'COMPLETED' ? 'COMPLETED' : 'CANCELLED'}`)}</p>}
        <p className="ride-route">
          <strong>{ride.pickup.label}</strong>
          {' → '}
          <strong>{ride.destination.label}</strong>
        </p>
      </section>
      <LiveStatus
        status={ride.status}
        etaTarget={ride.etaTarget}
        etaMinutes={ride.etaMinutes}
        lastLocationAt={ride.driver?.updatedAt}
        locationStale={ride.locationStale}
        name={driver}
      />
      {!finished && (
        <LiveRideMap
          shareToken={shareToken}
          pickup={ride.pickup}
          destination={ride.destination}
          target={target}
          car={ride.driver ? { lat: ride.driver.lat, lon: ride.driver.lon, accuracyM: ride.driver.accuracyM } : null}
        />
      )}
      <p className="last-updated">{t('network.lastUpdated', { time: formatLastUpdated(new Date(at)) })}</p>
    </>
  )
}
