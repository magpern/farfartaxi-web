/** Tiny external store for "is the network/backend usable". Kept React-free so api() can import it. */
const listeners = new Set<() => void>()
let backendUnreachable = false

function emit() {
  listeners.forEach((l) => l())
}

export function subscribeNetwork(listener: () => void): () => void {
  listeners.add(listener)
  if (typeof window !== 'undefined') {
    window.addEventListener('online', listener)
    window.addEventListener('offline', listener)
  }
  return () => {
    listeners.delete(listener)
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', listener)
      window.removeEventListener('offline', listener)
    }
  }
}

export function getBrowserOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false
}

export function getBackendUnreachable(): boolean {
  return backendUnreachable
}

/** Called by api(): true after a network error/timeout, false after any HTTP response. */
export function setBackendUnreachable(value: boolean) {
  if (backendUnreachable === value) return
  backendUnreachable = value
  emit()
}
