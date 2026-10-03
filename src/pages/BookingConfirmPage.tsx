import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useI18n } from '../i18n/context'
import type { RideResponse } from '../lib/rideTypes'
import { formatYmdHm } from '../lib/time'

export function BookingConfirmPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { state } = useLocation()
  const ride = (state as { ride?: RideResponse } | null)?.ride

  useEffect(() => {
    if (!ride) navigate('/app', { replace: true })
  }, [ride, navigate])

  if (!ride) return null

  return (
    <div className="confirm-screen">
      <h1 className="confirm-title">{t('confirm.title')}</h1>
      <div className="confirm-card">
        <p>
          <strong>{t('confirm.from')}</strong> {ride.fromAddress}
        </p>
        <p>
          <strong>{t('confirm.to')}</strong> {ride.toAddress}
        </p>
        <p>
          <strong>{t('confirm.time')}</strong> {formatYmdHm(ride.scheduledAt)}
        </p>
        <p className="tiny">
          {t('confirm.rideId')} {ride.id}
        </p>
      </div>
      <button type="button" className="btn btn-primary" onClick={() => navigate('/app')}>
        {t('common.ok')}
      </button>
    </div>
  )
}
