import type { RideResponse } from './rideTypes'

/**
 * Last known snapshot of a ride (including the other party's name and phone), kept in localStorage so
 * Ring/SMS keep working offline or while the backend is down. All access is wrapped: storage may be unavailable.
 */
const KEY = (id: number | string) => `farfartaxi-ride-cache:${id}`
const INDEX_KEY = 'farfartaxi-ride-cache-index'
const MAX_ENTRIES = 8

export type CachedRide = { ride: RideResponse; savedAt: number }

export function cacheRide(ride: RideResponse, now = Date.now()): void {
  try {
    localStorage.setItem(KEY(ride.id), JSON.stringify({ ride, savedAt: now } satisfies CachedRide))
    let index: number[] = []
    try {
      const parsed = JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]') as unknown
      if (Array.isArray(parsed)) index = parsed.filter((x): x is number => typeof x === 'number')
    } catch {
      index = []
    }
    index = [ride.id, ...index.filter((x) => x !== ride.id)]
    for (const old of index.slice(MAX_ENTRIES)) localStorage.removeItem(KEY(old))
    localStorage.setItem(INDEX_KEY, JSON.stringify(index.slice(0, MAX_ENTRIES)))
  } catch {
    /* quota / private mode: the cache is a convenience */
  }
}

export function readCachedRide(id: number | string): CachedRide | null {
  try {
    const raw = localStorage.getItem(KEY(id))
    if (!raw) return null
    const o = JSON.parse(raw) as CachedRide
    if (!o || typeof o.savedAt !== 'number' || !o.ride || typeof o.ride.id !== 'number') return null
    return o
  } catch {
    return null
  }
}
