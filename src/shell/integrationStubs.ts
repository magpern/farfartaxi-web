/**
 * Minimal local stand-ins for the exports of the parallel network/PWA worker:
 *   src/lib/network  -> NetworkBanner, useOnline
 *   src/pwa          -> UpdateBanner, registerUpdateGuard
 * The master replaces the contents of this file with re-exports from those modules
 * (`export { NetworkBanner, useOnline } from '../lib/network'` etc.). Nothing else imports the real ones directly.
 */
import { createElement, useEffect, useState } from 'react'
import { useI18n } from '../i18n/context'

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export function NetworkBanner() {
  const online = useOnline()
  const { t } = useI18n()
  if (online) return null
  return createElement('div', { className: 'net-banner', role: 'status' }, t('errors.offline'))
}

export function UpdateBanner() {
  return null
}

let guard: (() => boolean) | undefined

/** `fn` returns true when it is UNSAFE to reload the app. Returns an unregister function. */
export function registerUpdateGuard(fn: () => boolean): () => void {
  guard = fn
  return () => {
    if (guard === fn) guard = undefined
  }
}

/** Test/inspection helper for the stub only. */
export function __isReloadUnsafe(): boolean {
  return guard ? guard() : false
}
