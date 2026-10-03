import { api } from '../../api/client'

export type NotificationPrefs = { rideRequests: boolean; rideUpdates: boolean; reminders: boolean }
export const ALL_ON: NotificationPrefs = { rideRequests: true, rideUpdates: true, reminders: true }

type Wire = Partial<Record<keyof NotificationPrefs | 'ride_requests' | 'ride_updates', boolean>> & { reminders?: boolean }

export async function getNotificationPrefs(token: string): Promise<NotificationPrefs> {
  const w = await api<Wire>('/api/me/notification-prefs', { token })
  return {
    rideRequests: w?.rideRequests ?? w?.ride_requests ?? true,
    rideUpdates: w?.rideUpdates ?? w?.ride_updates ?? true,
    reminders: w?.reminders ?? true
  }
}

export async function putNotificationPrefs(token: string, prefs: NotificationPrefs): Promise<void> {
  await api('/api/me/notification-prefs', { method: 'PUT', token, body: JSON.stringify(prefs) })
}

/** Tell the backend which language push texts should use. Fire-and-forget. */
export function syncLocale(token: string, locale: string): void {
  void api('/api/me/locale', { method: 'PUT', token, body: JSON.stringify({ locale }) }).catch(() => undefined)
}
