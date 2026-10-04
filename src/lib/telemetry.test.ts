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
  trackFrontendError,
  trackRenderError,
  deriveSource
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
    expect(sanitizeEvent('frontend_error', { message: 'x', type: 'TypeError', code: 'UNHANDLED_ERROR' })).toEqual({ type: 'TypeError', code: 'UNHANDLED_ERROR' })
    expect(sanitizeEvent('frontend_error', { source: 'pos 59.42351' })).toBeNull()
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
  const flushPromises = () => new Promise((r) => setTimeout(r, 50))
  it('sends only type/source/code/line/fingerprint, never the message', async () => {
    trackFrontendError(new TypeError('Cannot read 59.42351 of https://a.se/x?token=abc'), 'https://a.se/assets/BookingPage-1a2b.js?v=1', 12)
    await flushPromises()
    const e = __queueSnapshot()[0]
    expect(Object.keys(e.props).sort()).toEqual(['code', 'fingerprint', 'line', 'source', 'type'])
    expect(e.props.type).toBe('TypeError')
    expect(e.props.code).toBe('UNHANDLED_ERROR')
    expect(e.props.line).toBe(12)
    expect(String(e.props.fingerprint)).toMatch(/^[0-9a-f]{16}$/)
    expect(JSON.stringify(e)).not.toContain('Cannot read')
    expect('message' in e.props).toBe(false)
  })
  it('fingerprint is stable for messages differing only in digits/case/urls', async () => {
    trackFrontendError(new Error('Ride 123 failed at https://a.se/x?q=1'))
    trackFrontendError(new Error('ride 98765   FAILED at https://b.se/y'))
    await flushPromises()
    const [a, b] = __queueSnapshot()
    expect(a.props.fingerprint).toBe(b.props.fingerprint)
    trackFrontendError(new Error('something else'))
    await flushPromises()
    expect(__queueSnapshot()[2].props.fingerprint).not.toBe(a.props.fingerprint)
  })
  it('source never contains / or ?', async () => {
    expect(deriveSource('https://a.se/assets/LiveRideMap-ab12.js?v=1/x')).not.toMatch(/[/?]/)
    expect(deriveSource('/a/b/c')).toBe('unknown')
    expect(deriveSource(undefined)).toBe('unknown')
    trackFrontendError('weird', 'https://a.se/a/b/???/c.js?x=/y', 1)
    await flushPromises()
    expect(String(__queueSnapshot()[0].props.source)).toMatch(/^[A-Za-z0-9_.-]{1,40}$/)
  })
  it('classifies types and render errors', async () => {
    trackFrontendError(new Error('Failed to fetch dynamically imported module'))
    trackFrontendError('plain string')
    trackRenderError(new RangeError('bad'))
    await flushPromises()
    const q = __queueSnapshot()
    expect(q.map((e) => e.props.type).sort()).toEqual(['ChunkLoadError', 'Other', 'RangeError'])
    expect(q.find((e) => e.props.type === 'RangeError')?.props.code).toBe('RENDER_ERROR')
  })
  it('dedupes identical messages and caps at 10 per session', async () => {
    trackFrontendError('same')
    trackFrontendError('same')
    for (let i = 0; i < 30; i++) trackFrontendError(`err ${i}`)
    await flushPromises()
    expect(__queueSnapshot()).toHaveLength(10)
  })
  it('captures window error and unhandledrejection', async () => {
    initTelemetry()
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom', filename: 'http://x/a.js?q=1', lineno: 3 }))
    const rej = new Event('unhandledrejection') as Event & { reason?: unknown }
    rej.reason = new Error('rejected')
    window.dispatchEvent(rej)
    await flushPromises()
    expect(__queueSnapshot().map((e) => [e.props.code, e.props.source])).toEqual([
      ['UNHANDLED_ERROR', 'a'],
      ['UNHANDLED_REJECTION', expect.any(String)]
    ])
  })
})
