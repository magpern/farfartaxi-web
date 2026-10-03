import { useI18n } from '../i18n/context'
import { formatHm } from '../lib/time'

/** "Senast uppdaterad 14:32", plus a clear stale/offline message when the last refresh failed. */
export function LastUpdated({ at, failed }: { at: number | null; failed: boolean }) {
  const { t } = useI18n()
  return (
    <div className={`last-updated ${failed ? 'last-updated-stale' : ''}`} role="status">
      {failed && <strong>{t('lastUpdated.stale')}</strong>}
      {at != null && <span> {t('lastUpdated.at', { time: formatHm(new Date(at).toISOString()) })}</span>}
    </div>
  )
}
