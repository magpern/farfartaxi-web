import { useState } from 'react'
import { useI18n } from '../i18n/context'
import { isIos, usePushStatus } from '../lib/push'
import { apiErrorMessage } from '../lib/apiErrors'
import { useShell } from '../shell/ShellContext'
import { isDriverRole } from '../shell/types'
import { Button, Card } from './ui'

export const DENIED_DISMISSED_KEY = 'farfartaxi-push-denied-dismissed'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DENIED_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Home / driver-home card: "Slå på notiser" when permission is still undecided (the prompt opens from the tap),
 * or one dismissible hint when notifications are blocked. Renders nothing otherwise.
 */
export function NotificationPrompt() {
  const { t } = useI18n()
  const { user, token, onToast } = useShell()
  const { status, busy, enable } = usePushStatus(token)
  const [deniedHidden, setDeniedHidden] = useState(readDismissed)
  const driver = isDriverRole(user.role)

  async function onEnable() {
    try {
      const r = await enable()
      if (r === 'granted') onToast(t('notifications.enabledToast'))
      else if (r === 'no-key') onToast(t('notifications.failedToast'))
    } catch (err) {
      onToast(apiErrorMessage(err, t))
    }
  }

  if (status === 'default') {
    return (
      <Card tone="highlight" className="push-card">
        <h2 className="section-title">{t('notifications.enableTitle')}</h2>
        <p>{t(driver ? 'notifications.whyDriver' : 'notifications.whyPassenger')}</p>
        <div className="push-card-actions">
          <Button variant="primary" size="lg" block disabled={busy} onClick={() => void onEnable()}>
            {busy ? t('notifications.enabling') : t('notifications.enableButton')}
          </Button>
        </div>
      </Card>
    )
  }

  if (status === 'denied' && !deniedHidden) {
    return (
      <Card tone="notice" className="push-card">
        <h2 className="section-title">{t('notifications.deniedTitle')}</h2>
        <p>{t(isIos() ? 'notifications.deniedIos' : 'notifications.deniedOther')}</p>
        <div className="push-card-actions">
          <Button
            onClick={() => {
              try {
                localStorage.setItem(DENIED_DISMISSED_KEY, '1')
              } catch {
                /* ignore */
              }
              setDeniedHidden(true)
            }}
          >
            {t('notifications.dismiss')}
          </Button>
        </div>
      </Card>
    )
  }

  return null
}
