import { pushSupported } from './env'

/** True when this browser holds a push subscription for the service worker. */
export async function hasPushSubscription(): Promise<boolean> {
  if (!pushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.ready
    return (await reg.pushManager.getSubscription()) !== null
  } catch {
    return false
  }
}
