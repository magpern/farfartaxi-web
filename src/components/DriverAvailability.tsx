import { useState } from 'react'
import { useI18n } from '../i18n/context'
import type { Availability, AvailabilityState } from '../lib/useAvailability'

/** ONE large on/off row (>= 64 px): the state is written out, not just a tiny checkbox. */
export function AvailabilityToggle({ state }: { state: AvailabilityState }) {
  const { t } = useI18n()
  const { value, busy, save } = state
  if (!value) return null
  const on = value.availableNow
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="avail-toggle"
      disabled={busy}
      onClick={() => void save({ ...value, availableNow: !on })}
    >
      <span>{on ? t('driver.availableNow') : t('driver.notAvailable')}</span>
      <span className="avail-switch" aria-hidden />
    </button>
  )
}

/** Away dates, collapsed by default ("Bortrest?"). */
export function AwayDates({ state }: { state: AvailabilityState }) {
  const { t } = useI18n()
  const { value, busy, save, onToast } = state
  const [from, setFrom] = useState<string | null>(null)
  const [until, setUntil] = useState<string | null>(null)
  if (!value) return null
  const f = from ?? value.awayFrom ?? ''
  const u = until ?? value.awayUntil ?? ''
  const awayDates = (): Pick<Availability, 'awayFrom' | 'awayUntil'> | null => {
    if (f && u && u < f) {
      onToast(t('driver.awayInvalid'))
      return null
    }
    return { awayFrom: f || null, awayUntil: u || null }
  }
  const hasAway = !!(value.awayFrom || value.awayUntil)
  return (
    <details className="card away-details" open={hasAway || undefined}>
      <summary>{hasAway ? t('driver.awayActive') : t('driver.awaySummary')}</summary>
      <div className="row">
        <label className="tiny">
          {t('driver.awayFrom')}
          <input type="date" className="sheet-input" value={f} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="tiny">
          {t('driver.awayUntil')}
          <input type="date" className="sheet-input" value={u} min={f || undefined} onChange={(e) => setUntil(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <button
          type="button"
          className="btn btn-touch btn-primary"
          disabled={busy}
          onClick={() => {
            const d = awayDates()
            if (d) void save({ ...value, ...d }).then(() => (setFrom(null), setUntil(null)))
          }}
        >
          {t('driver.awaySave')}
        </button>
        {(hasAway || f || u) && (
          <button
            type="button"
            className="btn btn-touch btn-outline"
            disabled={busy}
            onClick={() => void save({ ...value, awayFrom: null, awayUntil: null }).then(() => (setFrom(null), setUntil(null)))}
          >
            {t('driver.awayClear')}
          </button>
        )}
      </div>
    </details>
  )
}
