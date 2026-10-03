import { api } from '../api/client'

type T = (key: string, vars?: Record<string, string | number>) => string

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/** Subscribes this device to push (until M6 reworks it); returns the toast text to show. Throws on API errors. */
export async function enablePush(token: string, t: T): Promise<string> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return t('driver.pushNotSupported')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return t('driver.pushDenied')
  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const { publicKey } = await api<{ publicKey: string }>('/api/public/push-config')
  if (!publicKey) return t('driver.pushMissingKey')
  const sub =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    }))
  const json = sub.toJSON()
  await api('/api/push/subscriptions', {
    method: 'POST',
    token,
    body: JSON.stringify({
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      userAgent: navigator.userAgent
    })
  })
  return t('driver.pushEnabled')
}
