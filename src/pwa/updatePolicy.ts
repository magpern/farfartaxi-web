import { registerSW } from 'virtual:pwa-register'
import { readBookingDraftFromStorage } from '../lib/bookingDraft'

/** An update found within this long after startup, before any interaction, is applied silently. */
export const COLD_START_WINDOW_MS = 5_000
export const UPDATE_CHECK_INTERVAL_MS = 30 * 60_000

type Guard = () => boolean
const guards = new Set<Guard>()
const listeners = new Set<() => void>()

let needRefresh = false
let offlineReady = false
let startedAt = Date.now()
let interacted = false
let applyFn: ((reload?: boolean) => Promise<void>) | undefined
let applying = false
let cleanup: (() => void) | undefined

function emit() {
  listeners.forEach((l) => l())
}

/** Register a guard; returning true means "UNSAFE to reload now" (active ride, open form, ...). Returns unsubscribe. */
export function registerUpdateGuard(fn: () => boolean): () => void {
  guards.add(fn)
  return () => {
    guards.delete(fn)
  }
}

export function isUnsafe(): boolean {
  for (const g of guards) {
    try {
      if (g()) return true
    } catch {
      return true // a broken guard must never allow a reload mid-task
    }
  }
  return false
}

/** Built-in guard: a booking draft with any content is in progress. */
export function bookingDraftInProgress(): boolean {
  const d = readBookingDraftFromStorage()
  return !!d && (d.fromAddress.trim() !== '' || d.toAddress.trim() !== '' || !!d.pickupNote?.trim())
}

/** Apply the waiting update now, regardless of guards (used by the banner tap and by the silent paths). */
export function applyUpdate(): void {
  if (applying || !applyFn) return
  applying = true
  void applyFn(true)
}

export function subscribeUpdate(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function getUpdateAvailable(): boolean {
  return needRefresh
}
export function getOfflineReady(): boolean {
  return offlineReady
}

function maybeApplySilently() {
  if (!needRefresh) return
  if (document.visibilityState === 'hidden' && !isUnsafe()) applyUpdate()
}

function onNeedRefresh() {
  const coldStart = !interacted && Date.now() - startedAt <= COLD_START_WINDOW_MS
  if (coldStart) {
    applyUpdate()
    return
  }
  needRefresh = true
  emit()
  maybeApplySilently()
}

/** Registers the service worker and the update policy. Call once from main.tsx. Returns a teardown function. */
export function initPwa(): () => void {
  cleanup?.()
  startedAt = Date.now()
  interacted = false
  applying = false
  needRefresh = false
  offlineReady = false

  const markInteracted = () => {
    interacted = true
  }
  const interactionEvents = ['pointerdown', 'keydown', 'touchstart'] as const
  interactionEvents.forEach((e) => window.addEventListener(e, markInteracted, { once: true, passive: true }))

  let registration: ServiceWorkerRegistration | undefined
  const checkForUpdate = () => {
    registration?.update().catch(() => undefined)
  }
  const onVisibility = () => {
    if (document.visibilityState === 'visible') checkForUpdate()
    else maybeApplySilently()
  }
  document.addEventListener('visibilitychange', onVisibility)
  const interval = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS)

  const unregisterDraftGuard = registerUpdateGuard(bookingDraftInProgress)

  applyFn = registerSW({
    onNeedRefresh,
    onOfflineReady() {
      offlineReady = true
      emit()
    },
    onRegisteredSW(_url, reg) {
      registration = reg
    }
  })

  cleanup = () => {
    interactionEvents.forEach((e) => window.removeEventListener(e, markInteracted))
    document.removeEventListener('visibilitychange', onVisibility)
    window.clearInterval(interval)
    unregisterDraftGuard()
    cleanup = undefined
  }
  return cleanup
}
