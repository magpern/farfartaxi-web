import { useSyncExternalStore } from 'react'
import { getBackendUnreachable, getBrowserOnline, subscribeNetwork } from './state'

/** Browser online state, but false while the backend is unreachable (network errors/timeouts from api()). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeNetwork,
    () => getBrowserOnline() && !getBackendUnreachable(),
    () => true
  )
}

/** Browser offline vs. backend down, for choosing the banner text. */
export function useNetworkStatus(): 'online' | 'offline' | 'unreachable' {
  const browserOnline = useSyncExternalStore(subscribeNetwork, getBrowserOnline, () => true)
  const unreachable = useSyncExternalStore(subscribeNetwork, getBackendUnreachable, () => false)
  if (!browserOnline) return 'offline'
  return unreachable ? 'unreachable' : 'online'
}
