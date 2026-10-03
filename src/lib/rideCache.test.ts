import { beforeEach, describe, expect, it } from 'vitest'
import { writeActivePointer } from '../shell/activeRide'
import { cacheRide, claimRideCacheFor, clearRideCaches, readCachedRide, RIDE_CACHE_TTL_MS } from './rideCache'
import { ride } from '../test/render'

beforeEach(() => localStorage.clear())

describe('rideCache', () => {
  it('scopes entries by user', () => {
    cacheRide(1, ride('ACCEPTED'))
    expect(readCachedRide(1, 7)?.ride.id).toBe(7)
    expect(readCachedRide(2, 7)).toBeNull()
  })

  it('expires after 24 h', () => {
    const t0 = 1_000_000
    cacheRide(1, ride('ACCEPTED'), t0)
    expect(readCachedRide(1, 7, t0 + RIDE_CACHE_TTL_MS - 1)).not.toBeNull()
    expect(readCachedRide(1, 7, t0 + RIDE_CACHE_TTL_MS + 1)).toBeNull()
    expect(localStorage.getItem('farfartaxi-ride-cache:1:7')).toBeNull()
  })

  it('clears every ride cache key and the active pointer', () => {
    cacheRide(1, ride('ACCEPTED'))
    writeActivePointer(1, { role: 'PASSENGER', ride: ride('ACCEPTED') })
    localStorage.setItem('unrelated', 'x')
    clearRideCaches()
    expect(Object.keys(localStorage)).toEqual(['unrelated'])
  })

  it('wipes when a different user signs in, keeps for the same user', () => {
    claimRideCacheFor(1)
    cacheRide(1, ride('ACCEPTED'))
    claimRideCacheFor(1)
    expect(readCachedRide(1, 7)).not.toBeNull()
    claimRideCacheFor(2)
    expect(readCachedRide(1, 7)).toBeNull()
  })
})
