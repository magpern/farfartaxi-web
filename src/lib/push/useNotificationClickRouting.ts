import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { NOTIFICATION_CLICK_MESSAGE, safeUrl } from '../../sw/handlers'

/** The service worker asks the open window to route to a notification's ride: navigate in-app, no reload. */
export function useNotificationClickRouting(): void {
  const navigate = useNavigate()
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: unknown; url?: unknown } | null
      if (!d || d.type !== NOTIFICATION_CLICK_MESSAGE) return
      navigate(safeUrl(d.url))
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])
}
