import { useI18n } from '../../i18n/context'
import { rideStatusLabel, type StatusPerspective } from '../../lib/rideStatus'

const TONE: Record<string, string> = {
  REQUESTED: 'wait',
  NO_DRIVER: 'warn',
  ACCEPTED: 'ok',
  EN_ROUTE: 'go',
  ARRIVED: 'go',
  PICKED_UP: 'go',
  COMPLETED: 'done',
  CANCELLED: 'done'
}

/** Friendly status label; never the raw enum. */
export function StatusPill({ status, perspective = 'passenger' }: { status: string; perspective?: StatusPerspective }) {
  const { t } = useI18n()
  return <span className={`ui-pill ui-pill-${TONE[status] ?? 'done'}`}>{rideStatusLabel(t, status, perspective)}</span>
}
