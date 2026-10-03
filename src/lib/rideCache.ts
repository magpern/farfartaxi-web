import type { RideResponse } from './rideTypes'

/**
 * Last known snapshot of a ride (including the other party's name and phone), kept in localStorage so
 * Ring/SMS keep working offline or while the backend is down. Privacy: keys are scoped by user id, entries
 * expire after 24 h, and everything is wiped on logout and when a different user signs in.
 * All access is wrapped: storage may be unavailable.
 */
const PREFIX = 'farfartaxi-ride-cache'
const KEY = (userId: number, id: number | string) => `${PREFIX}:${userId}:${id}`
const INDEX_KEY = (userId: number) => `${PREFIX}-index:${userId}`
const OWNER_KEY = `${PREFIX}-owner`
const POINTER_PREFIX = 'farfartaxi-active-pointer'
const MAX_ENTRIES = 8
export const RIDE_CACHE_TTL_MS = 24 * 60 * 60 * 1000

export type CachedRide = { ride: RideResponse; savedAt: number }

function readIndex(userId: number): number[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(INDEX_KEY(userId)) ?? '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter((x): x is number => typeof x === 'number') : []
  } catch {
    return []
  }
}

export function cacheRide(userId: number, ride: RideResponse, now = Date.now()): void {
  try {
    localStorage.setItem(KEY(userId, ride.id), JSON.stringify({ ride, savedAt: now } satisfies CachedRide))
    const index = [ride.id, ...readIndex(userId).filter((x) => x !== ride.id)]
    for (const old of index.slice(MAX_ENTRIES)) localStorage.removeItem(KEY(userId, old))
    localStorage.setItem(INDEX_KEY(userId), JSON.stringify(index.slice(0, MAX_ENTRIES)))
  } catch {
    /* quota / private mode: the cache is a convenience */
  }
}

export function readCachedRide(userId: number, id: number | string, now = Date.now()): CachedRide | null {
  try {
    const raw = localStorage.getItem(KEY(userId, id))
    if (!raw) return null
    const o = JSON.parse(raw) as CachedRide
    if (!o || typeof o.savedAt !== 'number' || !o.ride || typeof o.ride.id !== 'number') return null
    if (now - o.savedAt > RIDE_CACHE_TTL_MS) {
      localStorage.removeItem(KEY(userId, id))
      return null
    }
    return o
  } catch {
    return null
  }
}

export function forgetCachedRide(userId: number, id: number | string): void {
  try {
    localStorage.removeItem(KEY(userId, id))
    localStorage.setItem(INDEX_KEY(userId), JSON.stringify(readIndex(userId).filter((x) => String(x) !== String(id))))
  } catch {
    /* ignore */
  }
}

/** Removes every cached ride snapshot and the active-ride pointer (any user). */
export function clearRideCaches(): void {
  try {
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && (k.startsWith(PREFIX) || k.startsWith(POINTER_PREFIX))) doomed.push(k)
    }
    doomed.forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}

/** Call when a user is signed in: wipes the caches if they belong to somebody else, then records the owner. */
export function claimRideCacheFor(userId: number): void {
  try {
    const owner = localStorage.getItem(OWNER_KEY)
    if (owner !== String(userId)) {
      clearRideCaches()
      localStorage.setItem(OWNER_KEY, String(userId))
    }
  } catch {
    /* ignore */
  }
}
