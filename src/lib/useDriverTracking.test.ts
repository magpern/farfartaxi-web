import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { retryTracking, shouldSendFix, useDriverTracking, useTrackingError } from './useDriverTracking'
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

describe('useDriverTracking accuracy and errors', () => {
  it('sends accuracy with each position', () => {
    renderHook(() => useDriverTracking('t', rides))
    fix(59, 18)
    const body = JSON.parse((post.mock.calls[0] as unknown as [string, { body: string }])[1].body)
    expect(body).toEqual({ lat: 59, lon: 18, accuracy: 5 })
  })

  it('publishes a denied error, clears it on the next fix, and retry restarts the watch', () => {
    const watch = vi.fn((cb: Cb, err: (e: { code: number }) => void) => ((emit = cb), (emitErr = err), 1))
    let emitErr: (e: { code: number }) => void = () => {}
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: watch, clearWatch: vi.fn() } })
    const { result } = renderHook(() => {
      useDriverTracking('t', rides)
      return useTrackingError()
    })
    expect(result.current).toBeNull()
    act(() => emitErr({ code: 1 }))
    expect(result.current).toBe('denied')
    const before = watch.mock.calls.length
    act(() => retryTracking())
    expect(watch.mock.calls.length).toBe(before + 1)
    act(() => fix(59, 18))
    expect(result.current).toBeNull()
  })
})

describe('useDriverTracking heartbeat', () => {
  it('re-sends the last fix every 60 s while stationary, with the same coordinates', () => {
    renderHook(() => useDriverTracking('t', rides))
    fix(59, 18)
    expect(post).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(30_000)
    expect(post).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(35_000)
    expect(post).toHaveBeenCalledTimes(2)
    const body = JSON.parse((post.mock.calls[1] as unknown as [string, { body: string }])[1].body)
    expect(body).toEqual({ lat: 59, lon: 18, accuracy: 5 })
    vi.advanceTimersByTime(60_000)
    expect(post).toHaveBeenCalledTimes(3)
  })

  it('does not heartbeat after a fresh fix was sent, nor after unmount', () => {
    const { unmount } = renderHook(() => useDriverTracking('t', rides))
    fix(59, 18)
    vi.advanceTimersByTime(50_000)
    fix(59.001, 18)
    expect(post).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(30_000)
    expect(post).toHaveBeenCalledTimes(2)
    unmount()
    vi.advanceTimersByTime(300_000)
    expect(post).toHaveBeenCalledTimes(2)
  })
})
