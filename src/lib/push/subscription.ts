import { api } from '../../api/client'
import { getPermission, pushSupported, type PushPermission } from './env'

export type SubscribeResult = PushPermission | 'no-key'

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return true // unknown: assume ok
  const x = new Uint8Array(a)
  return x.length === b.length && x.every((v, i) => v === b[i])
}

/** Ensure a browser subscription exists for the server's current key and register it with the backend. */
async function syncSubscription(token: string): Promise<SubscribeResult> {
  const reg = await navigator.serviceWorker.ready
  const { publicKey } = await api<{ publicKey?: string }>('/api/public/push-config')
  if (!publicKey) return 'no-key'
  const key = urlBase64ToUint8Array(publicKey)
  let sub = await reg.pushManager.getSubscription()
  // Server key rotated (or subscription otherwise unusable): start over.
  if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
    await sub.unsubscribe().catch(() => undefined)
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
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
  return 'granted'
}

/**
 * Ask for notification permission and subscribe. MUST be called directly from a user gesture
 * (the permission prompt is the first thing awaited). Throws ApiError if the backend call fails.
 */
export async function subscribe(token: string): Promise<SubscribeResult> {
  if (!pushSupported()) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission
  return syncSubscription(token)
}

/** App start: when permission is already granted, re-create a missing/expired subscription and re-sync the server. Never throws. */
export async function ensureSubscribed(token: string): Promise<boolean> {
  if (getPermission() !== 'granted') return false
  try {
    return (await syncSubscription(token)) === 'granted'
  } catch {
    return false
  }
}

/** Logout: delete this device's subscription server-side, then in the browser. Best effort, never throws. */
export async function unsubscribeOnLogout(token: string, maxMs = 4_000): Promise<void> {
  await Promise.race([unsubscribeInner(token), new Promise<void>((r) => setTimeout(r, maxMs))])
}

async function unsubscribeInner(token: string): Promise<void> {
  try {
    if (!pushSupported()) return
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return
    try {
      await api(`/api/push/subscriptions?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE', token, timeoutMs: 3_000 })
    } catch {
      /* still drop the browser subscription */
    }
    await sub.unsubscribe()
  } catch {
    /* best effort */
  }
}
