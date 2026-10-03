import { useSyncExternalStore } from 'react'
import { useI18n } from '../i18n/context'
import { applyUpdate, getUpdateAvailable, subscribeUpdate } from './updatePolicy'

/** "Ny version finns [Uppdatera]" — shown only when an update is waiting and was not applied silently. */
export function UpdateBanner() {
  const { t } = useI18n()
  const available = useSyncExternalStore(subscribeUpdate, getUpdateAvailable, () => false)
  if (!available) return null
  return (
    <div
      role="status"
      data-testid="update-banner"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 12,
        background: '#111827',
        color: '#fff',
        boxShadow: '0 4px 16px rgba(0,0,0,.3)'
      }}
    >
      <span>{t('pwa.newVersion')}</span>
      <button type="button" onClick={applyUpdate} style={{ minHeight: 48, padding: '0 18px', fontWeight: 700 }}>
        {t('pwa.update')}
      </button>
    </div>
  )
}
