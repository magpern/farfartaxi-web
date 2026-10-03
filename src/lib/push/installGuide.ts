import { isIos, isStandalone } from './env'

export const IOS_INSTALL_SNOOZE_KEY = 'farfartaxi-ios-install-dismissed'
export const IOS_INSTALL_SNOOZE_MS = 7 * 24 * 3600_000

export function snoozeIosInstallGuide(now = Date.now()): void {
  try {
    localStorage.setItem(IOS_INSTALL_SNOOZE_KEY, String(now))
  } catch {
    /* private mode */
  }
}

/** iOS Safari tab (not installed) and the guide was not dismissed within the last 7 days. */
export function shouldShowIosInstallGuide(now = Date.now()): boolean {
  if (!isIos() || isStandalone()) return false
  try {
    const at = Number(localStorage.getItem(IOS_INSTALL_SNOOZE_KEY))
    return !(at > 0 && now - at < IOS_INSTALL_SNOOZE_MS)
  } catch {
    return true
  }
}

export const NOTIF_SNOOZE_MS = 7 * 24 * 3600_000
export const notifSnoozeKey = (userId: number) => `farfartaxi-notif-snoozed-${userId}`

/** "Inte nu" on the enable-notifications card: hide it for 7 days, per user. */
export function snoozeNotificationPrompt(userId: number, now = Date.now()): void {
  try {
    localStorage.setItem(notifSnoozeKey(userId), String(now))
  } catch {
    /* private mode */
  }
}

export function isNotificationPromptSnoozed(userId: number, now = Date.now()): boolean {
  try {
    const at = Number(localStorage.getItem(notifSnoozeKey(userId)))
    return at > 0 && now - at < NOTIF_SNOOZE_MS
  } catch {
    return false
  }
}
