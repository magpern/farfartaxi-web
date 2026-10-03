import { useI18n } from '../../i18n/context'
import { useNetworkStatus } from './useOnline'

const style: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 1000,
  padding: 'calc(env(safe-area-inset-top, 0px) + 8px) 16px 8px',
  background: '#92400e',
  color: '#fff',
  textAlign: 'center',
  fontSize: '1rem',
  fontWeight: 600,
  pointerEvents: 'none'
}

/** Non-blocking status banner; renders nothing while online. */
export function NetworkBanner() {
  const { t } = useI18n()
  const status = useNetworkStatus()
  if (status === 'online') return null
  return (
    <div role="status" aria-live="polite" data-testid="network-banner" style={style}>
      {status === 'offline' ? t('network.offline') : t('network.unreachable')}
    </div>
  )
}
