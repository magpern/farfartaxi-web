import { describe, expect, it } from 'vitest'
import { relativeAgo, secondsSince, showAccuracyCircle, staleState, statusLine, tweenPoint } from './liveTracking'

const A = { lat: 59, lon: 18 }
const B = { lat: 60, lon: 20 }

describe('tweenPoint', () => {
  it('starts at from, ends at to, and never jumps or overshoots', () => {
    expect(tweenPoint(A, B, 0)).toEqual(A)
    expect(tweenPoint(A, B, 1000)).toEqual(B)
    expect(tweenPoint(A, B, 5000)).toEqual(B)
    expect(tweenPoint(A, B, -5)).toEqual(A)
    const mid = tweenPoint(A, B, 500)
    expect(mid.lat).toBeCloseTo(59.5)
    expect(mid.lon).toBeCloseTo(19)
    let prev = 59
    for (let ms = 0; ms <= 1000; ms += 50) {
      const p = tweenPoint(A, B, ms)
      expect(p.lat).toBeGreaterThanOrEqual(prev)
      expect(p.lat).toBeLessThanOrEqual(60)
      prev = p.lat
    }
  })
})

describe('accuracy circle', () => {
  it('shows only above 100 m', () => {
    expect(showAccuracyCircle(100)).toBe(false)
    expect(showAccuracyCircle(100.1)).toBe(true)
    expect(showAccuracyCircle(15)).toBe(false)
    expect(showAccuracyCircle(null)).toBe(false)
    expect(showAccuracyCircle(undefined)).toBe(false)
  })
})

describe('statusLine', () => {
  it('EN_ROUTE shows minutes to the pickup', () => {
    expect(statusLine('EN_ROUTE', 'PICKUP', 6)).toEqual({ key: 'live.enRouteEta', vars: { min: 6 } })
  })
  it('ARRIVED has no minutes', () => {
    expect(statusLine('ARRIVED', 'PICKUP', 0)).toEqual({ key: 'live.arrived', vars: {} })
  })
  it('PICKED_UP shows minutes to the destination', () => {
    expect(statusLine('PICKED_UP', 'DESTINATION', 12)).toEqual({ key: 'live.pickedUpEta', vars: { min: 12 } })
  })
  it('ignores an ETA measured to the wrong stop', () => {
    expect(statusLine('PICKED_UP', 'PICKUP', 3)).toEqual({ key: 'live.pickedUp', vars: {} })
    expect(statusLine('EN_ROUTE', 'DESTINATION', 3)).toEqual({ key: 'live.enRoute', vars: {} })
  })
  it('falls back without an ETA and is null for other statuses', () => {
    expect(statusLine('EN_ROUTE', null, null)).toEqual({ key: 'live.enRoute', vars: {} })
    expect(statusLine('ACCEPTED', null, 5)).toBeNull()
  })
})

describe('relative time and stale detection', () => {
  const now = Date.parse('2026-10-25T10:10:00Z')
  const at = (s: number) => new Date(now - s * 1000).toISOString()
  it('counts seconds, then minutes', () => {
    expect(secondsSince(at(20), now)).toBe(20)
    expect(secondsSince(null, now)).toBeNull()
    expect(relativeAgo(20)).toEqual({ key: 'live.updatedAgoSec', n: 20 })
    expect(relativeAgo(185)).toEqual({ key: 'live.updatedAgoMin', n: 3 })
  })
  it('is stale after 2 minutes or when the server says so, only while driving', () => {
    expect(staleState('EN_ROUTE', false, at(119), now)).toBeNull()
    expect(staleState('EN_ROUTE', false, at(121), now)).toEqual({ minutes: 2 })
    expect(staleState('PICKED_UP', false, at(400), now)).toEqual({ minutes: 6 })
    expect(staleState('EN_ROUTE', true, at(10), now)).toEqual({ minutes: 2 })
    expect(staleState('EN_ROUTE', true, null, now)).toEqual({ minutes: null })
    expect(staleState('EN_ROUTE', false, null, now)).toBeNull()
    expect(staleState('ACCEPTED', true, at(900), now)).toBeNull()
  })
})
