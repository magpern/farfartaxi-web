import { describe, expect, it } from 'vitest'
import { ride } from '../test/render'
import { activeRideTarget, decideActiveRideRedirect, isHomePath, readActivePointer, sameActive, writeActivePointer } from './activeRide'

const passenger = (status = 'REQUESTED') => ({ role: 'PASSENGER' as const, ride: ride(status) })
const driver = (status: string) => ({ role: 'DRIVER' as const, ride: ride(status) })

describe('activeRideTarget', () => {
  it('sends passengers to the ride screen for any active status', () => {
    expect(activeRideTarget(passenger('ACCEPTED'))).toBe('/app/resa/7')
    expect(activeRideTarget(passenger('NO_DRIVER'))).toBe('/app/resa/7')
  })
  it('sends drivers to driving mode only for EN_ROUTE..PICKED_UP', () => {
    for (const s of ['EN_ROUTE', 'ARRIVED', 'PICKED_UP']) expect(activeRideTarget(driver(s))).toBe('/app/forare/kor/7')
    expect(activeRideTarget(driver('ACCEPTED'))).toBeNull()
  })
  it('does nothing without an active ride', () => {
    expect(activeRideTarget(null)).toBeNull()
    expect(activeRideTarget(undefined)).toBeNull()
  })
})

describe('decideActiveRideRedirect', () => {
  it('redirects on entry from a home path', () => {
    expect(decideActiveRideRedirect({ active: passenger(), pathname: '/app', armed: true })).toBe('/app/resa/7')
    expect(decideActiveRideRedirect({ active: driver('EN_ROUTE'), pathname: '/app/forare', armed: true })).toBe('/app/forare/kor/7')
  })
  it('lets people leave via tabs: no redirect when not armed or off a home path', () => {
    expect(decideActiveRideRedirect({ active: passenger(), pathname: '/app', armed: false })).toBeNull()
    expect(decideActiveRideRedirect({ active: passenger(), pathname: '/app/mer', armed: true })).toBeNull()
    expect(decideActiveRideRedirect({ active: passenger(), pathname: '/app/resa/7', armed: true })).toBeNull()
  })
  it('knows the home paths', () => {
    expect(isHomePath('/app/')).toBe(true)
    expect(isHomePath('/app/forare')).toBe(true)
    expect(isHomePath('/app/boka')).toBe(false)
  })
})

describe('active pointer (offline cold start)', () => {
  it('round-trips and expires', () => {
    writeActivePointer(5, passenger('ACCEPTED'))
    expect(readActivePointer(5)).toMatchObject({ role: 'PASSENGER', id: 7 })
    expect(readActivePointer(5, Date.now() + 7 * 3600_000)).toBeNull()
    writeActivePointer(5, null)
    expect(readActivePointer(5)).toBeNull()
  })
})

describe('sameActive', () => {
  it('is true for structurally equal rides and false when a field changes', () => {
    const a = { role: 'PASSENGER' as const, ride: ride('ACCEPTED') }
    expect(sameActive(a, { role: 'PASSENGER', ride: ride('ACCEPTED') })).toBe(true)
    expect(sameActive(a, { role: 'PASSENGER', ride: ride('EN_ROUTE') })).toBe(false)
    expect(sameActive(a, null)).toBe(false)
    expect(sameActive(null, null)).toBe(true)
  })
})
