import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import { useI18n } from '../i18n/context'
import { apiErrorMessage } from '../lib/apiErrors'
import { useBusy } from '../lib/useBusy'

type Availability = { availableNow: boolean; awayFrom: string | null; awayUntil: string | null }

export function DriverAvailability({ token, onToast }: { token: string; onToast: (m: string) => void }) {
  const { t } = useI18n()
  const { busy, run } = useBusy()
  const [value, setValue] = useState<Availability | null>(null)
  const [from, setFrom] = useState('')
  const [until, setUntil] = useState('')

  const apply = useCallback((a: Availability) => {
    setValue(a)
    setFrom(a.awayFrom ?? '')
    setUntil(a.awayUntil ?? '')
  }, [])

  useEffect(() => {
    api<Availability>('/api/driver/availability', { token })
      .then(apply)
      .catch(() => {
        /* panel stays hidden until the next successful load */
      })
  }, [token, apply])

  const save = (next: Availability) =>
    run(async () => {
      try {
        apply(await api<Availability>('/api/driver/availability', { method: 'PUT', token, body: JSON.stringify(next) }))
        onToast(t('driver.availabilitySaved'))
      } catch (err) {
        onToast(apiErrorMessage(err, t))
      }
    })

  if (!value) return null

  const awayDates = (): Pick<Availability, 'awayFrom' | 'awayUntil'> | null => {
    if (from && until && until < from) {
      onToast(t('driver.awayInvalid'))
      return null
    }
    return { awayFrom: from || null, awayUntil: until || null }
  }

  return (
    <div className="card">
      <h3>{t('driver.availabilityTitle')}</h3>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={value.availableNow}
          disabled={busy}
          onChange={(e) => void save({ ...value, availableNow: e.target.checked })}
        />
        <span>{t('driver.availableNow')}</span>
      </label>
      <h4>{t('driver.awayTitle')}</h4>
      <div className="row">
        <label className="tiny">
          {t('driver.awayFrom')}
          <input type="date" className="sheet-input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="tiny">
          {t('driver.awayUntil')}
          <input type="date" className="sheet-input" value={until} min={from || undefined} onChange={(e) => setUntil(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <button
          type="button"
          className="btn btn-touch btn-primary"
          disabled={busy}
          onClick={() => {
            const d = awayDates()
            if (d) void save({ ...value, ...d })
          }}
        >
          {t('driver.awaySave')}
        </button>
        {(value.awayFrom || value.awayUntil || from || until) && (
          <button
            type="button"
            className="btn btn-touch btn-outline"
            disabled={busy}
            onClick={() => void save({ ...value, awayFrom: null, awayUntil: null })}
          >
            {t('driver.awayClear')}
          </button>
        )}
      </div>
    </div>
  )
}
