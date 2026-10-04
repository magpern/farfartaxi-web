import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_STORAGE_KEY } from './session'
import {
  __queueSnapshot,
  __resetTelemetry,
  flush,
  FLUSH_INTERVAL_MS,
  initTelemetry,
  MAX_QUEUE,
  sanitizeEvent,
  setBookingSource,
  getBookingSource,
  track,
  trackFrontendError
} from './telemetry'

const fetchMock = vi.fn()

function jwt(expInSec: number) {
  return `h.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expInSec }))}.s`
}
function login(approved = true) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: jwt(3600), user: { approved } }))
}
function setOnline(v: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: v })
}
function setVisibility(v: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: v })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  __resetTelemetry()
  sessionStorage.clear()
  localStorage.clear()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, status: 204 })
  vi.stubGlobal('fetch', fetchMock)
  setOnline(true)
})
afterEach(() => vi.unstubAllGlobals())

describe('allowlist', () => {
  it('drops unknown names and unknown keys', () => {
    track('page_view', { a: 1 })
    track('booking_started', { kind: 'NOW', source: 'home', extra: 'x' })
    expect(__queueSnapshot().map((e) => [e.name, e.props])).toEqual([['booking_started', { kind: 'NOW', source: 'home' }]])
  })
  it('drops values of the wrong type or outside enums', () => {
    expect(sanitizeEvent('booking_created', { kind: 'LATER', source: 'home' })).toEqual({ source: 'home' })
    expect(sanitizeEvent('search_empty', { queryLength: '3' })).toEqual({})
    expect(sanitizeEvent('push_permission', { state: 'granted' })).toEqual({ state: 'granted' })
  })
  it('rejects PII-ish keys and coordinate-like numbers', () => {
    expect(sanitizeEvent('search_empty', { queryLength: 3, address: 'Storgatan 1' })).toBeNull()
    expect(sanitizeEvent('search_empty', { latitude: 1 })).toBeNull()
    expect(sanitizeEvent('search_empty', { userName: 'x' })).toBeNull()
    expect(sanitizeEvent('search_empty', { phone: '1' })).toBeNull()
    expect(sanitizeEvent('search_empty', { queryLength: 59.3318 })).toBeNull()
    expect(sanitizeEvent('search_empty', { queryLength: 4 })).toEqual({ queryLength: 4 })
  })
  it('caps the queue at 200', () => {
    for (let i = 0; i < MAX_QUEUE + 20; i++) track('push_opened')
    expect(__queueSnapshot()).toHaveLength(MAX_QUEUE)
  })
  it('tracks the booking source', () => {
    expect(getBookingSource()).toBe('home')
    setBookingSource('rebook')
    expect(getBookingSource()).toBe('rebook')
  })
})

describe('flush', () => {
  it('sends a keepalive request with the bearer token and a stable session id', async () => {
    login()
    track('push_opened')
    await flush()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/telemetry/events')
    expect(init.keepalive).toBe(true)
    expect(init.headers.Authorization).toMatch(/^Bearer h\./)
    const body = JSON.parse(init.body)
    expect(body.sessionId).toBeTruthy()
    expect(body.events[0]).toMatchObject({ name: 'push_opened', props: {} })
    expect(__queueSnapshot()).toHaveLength(0)
    track('push_opened')
    await flush()
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).sessionId).toBe(body.sessionId)
  })
  it('batches at most 50 events per request', async () => {
    login()
    for (let i = 0; i < 120; i++) track('push_opened')
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).events).toHaveLength(50)
  })
  it('does nothing when logged out or unapproved', async () => {
    track('push_opened')
    await flush()
    login(false)
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(__queueSnapshot()).toHaveLength(1)
  })
  it('keeps the queue while offline', async () => {
    login()
    setOnline(false)
    track('push_opened')
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(__queueSnapshot()).toHaveLength(1)
  })
  it('requeues on network failure, drops on 4xx, and never throws', async () => {
    login()
    track('push_opened')
    fetchMock.mockRejectedValueOnce(new Error('down'))
    await expect(flush()).resolves.toBeUndefined()
    expect(__queueSnapshot()).toHaveLength(1)
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400 })
    await flush()
    expect(__queueSnapshot()).toHaveLength(0)
  })
  it('flushes every 30 s and when the page is hidden or hides', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      login()
      initTelemetry()
      track('push_opened')
      vi.advanceTimersByTime(FLUSH_INTERVAL_MS)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await vi.waitFor(() => expect(__queueSnapshot()).toHaveLength(0))
      await new Promise((r) => setTimeout(r, 0))
      track('push_opened')
      setVisibility('hidden')
      expect(fetchMock).toHaveBeenCalledTimes(2)
      await vi.waitFor(() => expect(__queueSnapshot()).toHaveLength(0))
      await new Promise((r) => setTimeout(r, 0))
      track('push_opened')
      window.dispatchEvent(new Event('pagehide'))
      expect(fetchMock).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('privacy checks and enums', () => {
  it('drops events with coordinate-like strings and strips relative URL queries', () => {
    trackFrontendError('GET /api/places/reverse?lat=59.42351&lon=17.91234 failed')
    expect(__queueSnapshot()[0].props.message).toBe('GET /api/places/reverse failed')
    for (const m of ['Invalid LatLng object: (59.42351, NaN)', 'pos 59.42351', '59,42351 17,91234']) trackFrontendError(m)
    expect(__queueSnapshot()).toHaveLength(1)
  })
  it('enforces provider/kind/status enums', () => {
    expect(sanitizeEvent('search_result_selected', { provider: 'SL', kind: 'STOP' })).toEqual({ provider: 'SL', kind: 'STOP' })
    expect(sanitizeEvent('search_result_selected', { provider: 'GOOGLE', kind: 'X' })).toEqual({})
    expect(sanitizeEvent('ride_cancelled', { status: 'by_driver' })).toEqual({ status: 'by_driver' })
    expect(sanitizeEvent('ride_cancelled', { status: 'nope' })).toEqual({})
    expect(sanitizeEvent('push_opened', { kind: 'RIDE_ACCEPTED' })).toEqual({ kind: 'RIDE_ACCEPTED' })
    expect(sanitizeEvent('push_opened', { kind: 'x'.repeat(41) })).toEqual({})
  })
})

describe('flush with expired token', () => {
  function expired() {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: jwt(-100), user: { approved: true } }))
  }
  it('refreshes once before flushing', async () => {
    expired()
    track('push_opened')
    const fresh = jwt(3600)
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('/auth/refresh') ? { ok: true, status: 200, json: async () => ({ token: fresh }) } : { ok: true, status: 204 }
    )
    await flush()
    const calls = fetchMock.mock.calls
    expect(calls[0][0]).toContain('/api/auth/refresh')
    expect(calls[1][1].headers.Authorization).toBe(`Bearer ${fresh}`)
    expect(__queueSnapshot()).toHaveLength(0)
  })
  it('keeps events when refresh fails and does not loop on 401', async () => {
    expired()
    track('push_opened')
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    await flush()
    expect(__queueSnapshot()).toHaveLength(1)
    login()
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    await flush()
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/telemetry')).length).toBe(1)
    expect(__queueSnapshot()).toHaveLength(1)
  })
})

describe('frontend_error', () => {
  it('strips url query/fragment, truncates and caps lengths', () => {
    trackFrontendError('Failed https://a.se/x?token=abc#frag now', 'https://a.se/app.js?v=1', 12)
    const e = __queueSnapshot()[0]
    expect(e.props.message).toBe('Failed https://a.se/x now')
    expect(e.props.source).toBe('https://a.se/app.js')
    expect(e.props.line).toBe(12)
    trackFrontendError('y'.repeat(500))
    expect((__queueSnapshot()[1].props.message as string).length).toBe(200)
  })
  it('dedupes identical messages and caps at 10 per session', () => {
    trackFrontendError('same')
    trackFrontendError('same')
    expect(__queueSnapshot()).toHaveLength(1)
    for (let i = 0; i < 30; i++) trackFrontendError(`err ${i}`)
    expect(__queueSnapshot()).toHaveLength(10)
  })
  it('captures window error and unhandledrejection', () => {
    initTelemetry()
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom', filename: 'http://x/a.js?q=1', lineno: 3 }))
    const rej = new Event('unhandledrejection') as Event & { reason?: unknown }
    rej.reason = new Error('rejected')
    window.dispatchEvent(rej)
    expect(__queueSnapshot().map((e) => e.props.message)).toEqual(['boom', 'rejected'])
  })
})
