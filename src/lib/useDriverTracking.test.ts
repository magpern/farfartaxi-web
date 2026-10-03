import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shouldSendFix, useDriverTracking } from './useDriverTracking'
import type { RideResponse } from './rideTypes'

const post = vi.fn(() => Promise.resolve())
vi.mock('../api/client', () => ({ api: (...a: unknown[]) => (post as (...x: unknown[]) => unknown)(...a) }))

type Cb = (p: { coords: { latitude: number; longitude: number; accuracy: number } }) => void
let emit: Cb
const fix = (lat: number, lon: number) => emit({ coords: { latitude: lat, longitude: lon, accuracy: 5 } })
const rides = [{ id: 7, status: 'EN_ROUTE' }] as RideResponse[]

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-25T10:00:00Z'))
  post.mockClear()
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { watchPosition: (cb: Cb) => ((emit = cb), 1), clearWatch: vi.fn() }
  })
})
afterEach(() => vi.useRealTimers())

describe('useDriverTracking throttle', () => {
  it('sends the first fix, then at most every 10 s', () => {
    renderHook(() => useDriverTracking('t', rides))
    fix(59, 18)
    expect(post).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(3000)
    fix(59, 18.00001)
    vi.advanceTimersByTime(3000)
    fix(59, 18.00002)
    expect(post).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(4000)
    fix(59, 18.00003)
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('sends immediately when moved >= 50 m', () => {
    renderHook(() => useDriverTracking('t', rides))
    fix(59, 18)
    vi.advanceTimersByTime(1000)
    fix(59.001, 18) // ~111 m north
    expect(post).toHaveBeenCalledTimes(2)
  })
})

describe('shouldSendFix', () => {
  it('always sends without a previous fix', () => {
    expect(shouldSendFix(null, 0, 0, 0)).toBe(true)
  })
})
