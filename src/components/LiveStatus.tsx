import { useI18n } from '../i18n/context'
import { relativeAgo, secondsSince, staleState, statusLine, type EtaTarget } from '../lib/liveTracking'
import { useNow } from '../lib/useNow'

/** "Folke" -> "Folkes" (sv; no extra s after s/x/z) / "Folke's" (en). */
function possessive(name: string, locale: string): string {
  if (locale === 'en') return `${name}'s`
  return /[sxz]$/i.test(name) ? name : `${name}s`
}

type Props = {
  status: string
  etaTarget?: EtaTarget | null
  etaMinutes?: number | null
  lastLocationAt: string | null | undefined
  locationStale?: boolean | null
  /** Driver's first name. */
  name: string
}

/** Big status/ETA line, ticking "updated n s ago" and the stale-position warning. */
export function LiveStatus({ status, etaTarget, etaMinutes, lastLocationAt, locationStale, name }: Props) {
  const { t, locale } = useI18n()
  const now = useNow()
  const line = statusLine(status, etaTarget, etaMinutes)
  if (!line) return null
  const secs = secondsSince(lastLocationAt, now)
  const ago = secs === null ? null : relativeAgo(secs)
  const stale = staleState(status, locationStale, lastLocationAt, now)
  return (
    <div className="live-status">
      <p className="live-status-line" data-testid="live-status-line">
        {t(line.key, { ...line.vars, name })}
      </p>
      {ago && (
        <p className="live-status-ago muted" data-testid="live-ago">
          {t(ago.key, { n: ago.n })}
        </p>
      )}
      {stale && (
        <p className="notice live-stale" role="alert" data-testid="live-stale">
          {stale.minutes === null ? t('live.staleNone', { name }) : t('live.stale', { name, nameGen: possessive(name, locale), min: stale.minutes })}
        </p>
      )}
    </div>
  )
}
