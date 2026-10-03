import { useCallback, useState } from 'react'
import { useI18n } from '../../i18n/context'
import { formatLastUpdated } from './lastUpdated'

/** Call `touch()` after each successful data load; `label` is e.g. "Senast uppdaterad 14:32" (null before first load). */
export function useLastUpdated(): { lastUpdated: Date | null; touch: (at?: Date) => void; label: string | null } {
  const { t } = useI18n()
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const touch = useCallback((at?: Date) => setLastUpdated(at ?? new Date()), [])
  const label = lastUpdated ? t('network.lastUpdated', { time: formatLastUpdated(lastUpdated) }) : null
  return { lastUpdated, touch, label }
}
