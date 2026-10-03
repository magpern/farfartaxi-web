import { isIos as isIosNav } from '../navigation'

export type PushPermission = NotificationPermission | 'unsupported'

export function isIos(): boolean {
  return typeof navigator !== 'undefined' && isIosNav(navigator)
}

/** Running as an installed app (iOS `navigator.standalone` or display-mode: standalone). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  } catch {
    /* ignore */
  }
  return Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
}

/** Service worker + Push API + Notification API all present (false in an iOS Safari tab that is not installed). */
export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function getPermission(): PushPermission {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission
}
