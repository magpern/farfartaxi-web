import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/context'
import { ALL_ON, getNotificationPrefs, putNotificationPrefs, usePushStatus, type NotificationPrefs } from '../lib/push'
import { apiErrorMessage } from '../lib/apiErrors'
import { useShell } from '../shell/ShellContext'
import { isDriverRole } from '../shell/types'
import { Button, Card } from './ui'

/** Mer → Notiser: status (På/Av/Blockerad) and the preference toggles. */
export function NotificationSettings() {
  const { t } = useI18n()
  const { user, token, onToast, openInstall } = useShell()
  const { status, busy, enable } = usePushStatus(token)
  const [prefs, setPrefs] = useState<NotificationPrefs>(ALL_ON)
  const [loaded, setLoaded] = useState(false)
  const driver = isDriverRole(user.role)

  useEffect(() => {
    let cancelled = false
    getNotificationPrefs(token)
      .then((p) => {
        if (!cancelled) setPrefs(p)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  async function toggle(key: keyof NotificationPrefs, value: boolean) {
    const prev = prefs
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    try {
      await putNotificationPrefs(token, next)
    } catch {
      setPrefs(prev)
      onToast(t('notifications.prefsFailed'))
    }
  }

  async function onEnable() {
    try {
      const r = await enable()
      if (r === 'granted') onToast(t('notifications.enabledToast'))
      else if (r === 'no-key') onToast(t('notifications.failedToast'))
    } catch (err) {
      onToast(apiErrorMessage(err, t))
    }
  }

  const statusText =
    status === 'granted'
      ? t('notifications.statusOn')
      : status === 'denied'
        ? t('notifications.statusBlocked')
        : status === 'unsupported' || status === 'needs-install'
          ? t('notifications.statusUnsupported')
          : t('notifications.statusOff')

  const rows: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
    ...(driver ? [{ key: 'rideRequests' as const, label: t('notifications.rideRequests'), hint: t('notifications.rideRequestsHint') }] : []),
    { key: 'rideUpdates', label: t('notifications.rideUpdates'), hint: t('notifications.rideUpdatesHint') },
    { key: 'reminders', label: t('notifications.reminders'), hint: t('notifications.remindersHint') }
  ]

  return (
    <Card aria-labelledby="notif-title">
      <h2 className="section-title" id="notif-title">
        {t('notifications.title')}
      </h2>
      <p>
        {t('notifications.statusLabel')}: <strong data-testid="push-status">{statusText}</strong>
      </p>
      {status === 'default' && (
        <Button variant="primary" size="lg" block disabled={busy} onClick={() => void onEnable()}>
          {t('notifications.enableButton')}
        </Button>
      )}
      {status === 'denied' && <p className="muted tiny">{t('notifications.deniedOther')}</p>}
      {status === 'needs-install' && (
        <>
          <p className="muted tiny">{t('notifications.needsInstall')}</p>
          <Button onClick={openInstall}>{t('notifications.installCta')}</Button>
        </>
      )}
      {status === 'unsupported' && <p className="muted tiny">{t('notifications.unsupported')}</p>}
      <h3 className="section-title">{t('notifications.prefsTitle')}</h3>
      {rows.map((r) => (
        <label key={r.key} className="toggle-row">
          <input
            type="checkbox"
            checked={prefs[r.key]}
            disabled={!loaded}
            onChange={(e) => void toggle(r.key, e.target.checked)}
          />
          <span>
            {r.label}
            <span className="tiny muted block">{r.hint}</span>
          </span>
        </label>
      ))}
    </Card>
  )
}
