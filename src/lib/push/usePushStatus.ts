import { useCallback, useEffect, useState } from 'react'
import { getPermission, isIos, isStandalone, pushSupported } from './env'
import { hasPushSubscription } from './hasSubscription'
import { subscribe, type SubscribeResult } from './subscription'

/**
 * - needs-install: iOS Safari tab (push only works from the home-screen app)
 * - unsupported: no Push API at all
 * - default / denied / granted: Notification.permission
 */
export type PushStatus = 'needs-install' | 'unsupported' | 'default' | 'denied' | 'granted'

export function currentPushStatus(): PushStatus {
  if (isIos() && !isStandalone()) return 'needs-install'
  if (!pushSupported()) return 'unsupported'
  return getPermission() as 'default' | 'denied' | 'granted'
}

export function usePushStatus(token: string) {
  const [status, setStatus] = useState<PushStatus>(currentPushStatus)
  const [busy, setBusy] = useState(false)
  const [subscribed, setSubscribed] = useState<boolean | null>(null)

  // Permission can change in the OS settings while we are in the background.
  useEffect(() => {
    const refresh = () => {
      setStatus(currentPushStatus())
      void hasPushSubscription().then(setSubscribed)
    }
    refresh()
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [])

  /** Call from a click handler. Resolves to the outcome (errors from the backend reject). */
  const enable = useCallback(async (): Promise<SubscribeResult> => {
    setBusy(true)
    try {
      return await subscribe(token)
    } finally {
      setBusy(false)
      setStatus(currentPushStatus())
      void hasPushSubscription().then(setSubscribed)
    }
  }, [token])

  /** `subscribed` is null until the first check finishes. */
  return { status, busy, enable, subscribed }
}
