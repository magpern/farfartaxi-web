import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import { useI18n } from '../i18n/context'
import { apiErrorMessage } from './apiErrors'
import { useBusy } from './useBusy'

export type Availability = { availableNow: boolean; awayFrom: string | null; awayUntil: string | null }

export type AvailabilityState = {
  value: Availability | null
  busy: boolean
  save: (next: Availability) => Promise<void>
  onToast: (m: string) => void
}

/** Loads and saves the driver's availability; shared by the top toggle and the collapsed away-dates panel. */
export function useAvailability(token: string, onToast: (m: string) => void): AvailabilityState {
  const { t } = useI18n()
  const { busy, run } = useBusy()
  const [value, setValue] = useState<Availability | null>(null)

  useEffect(() => {
    api<Availability>('/api/driver/availability', { token })
      .then(setValue)
      .catch(() => {
        /* panel stays hidden until the next successful load */
      })
  }, [token])

  const save = useCallback(
    (next: Availability) =>
      run(async () => {
        try {
          setValue(await api<Availability>('/api/driver/availability', { method: 'PUT', token, body: JSON.stringify(next) }))
          onToast(t('driver.availabilitySaved'))
        } catch (err) {
          onToast(apiErrorMessage(err, t))
        }
      }),
    [run, token, onToast, t]
  )

  return { value, busy, save, onToast }
}
