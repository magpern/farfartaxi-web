import { act, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n/context'
import { ApiError, api } from '../../api/client'
import { NetworkBanner, formatLastUpdated, useOnline } from './index'
import { setBackendUnreachable } from './state'

function setNavigatorOnline(v: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: v })
}
const ok = () => new Response(JSON.stringify({ a: 1 }), { status: 200, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  localStorage.setItem('farfartaxi-locale', 'sv')
  setNavigatorOnline(true)
  setBackendUnreachable(false)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('useOnline', () => {
  it('follows online/offline events', () => {
    const { result } = renderHook(() => useOnline())
    expect(result.current).toBe(true)
    act(() => {
      setNavigatorOnline(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)
    act(() => {
      setNavigatorOnline(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toBe(true)
  })

  it('backend-unreachable is set by failing api() and cleared by the next success', async () => {
    const f = vi.fn().mockRejectedValueOnce(new TypeError('x')).mockResolvedValue(ok())
    vi.stubGlobal('fetch', f)
    const { result } = renderHook(() => useOnline())
    await act(async () => {
      await expect(api('/api/x', { method: 'POST' })).rejects.toMatchObject({ status: 0, code: 'NETWORK' })
    })
    expect(result.current).toBe(false)
    await act(async () => {
      await api('/api/x')
    })
    expect(result.current).toBe(true)
  })
})

describe('api() network behaviour', () => {
  it('times out with ApiError TIMEOUT', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn((_u: string, init: RequestInit) => new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('a', 'AbortError')))))
    )
    const p = api('/api/x', { method: 'POST', timeoutMs: 50 })
    const assertion = expect(p).rejects.toSatisfy((e) => e instanceof ApiError && e.status === 0 && e.code === 'TIMEOUT')
    await vi.advanceTimersByTimeAsync(60)
    await assertion
  })

  it.each(['POST', 'PATCH', 'DELETE'])('does not retry %s', async (method) => {
    const f = vi.fn().mockRejectedValue(new TypeError('x'))
    vi.stubGlobal('fetch', f)
    await expect(api('/api/x', { method })).rejects.toMatchObject({ code: 'NETWORK' })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('retries a GET once on network error', async () => {
    const f = vi.fn().mockRejectedValueOnce(new TypeError('x')).mockResolvedValue(ok())
    vi.stubGlobal('fetch', f)
    await expect(api('/api/x')).resolves.toEqual({ a: 1 })
    expect(f).toHaveBeenCalledTimes(2)
    f.mockReset().mockRejectedValue(new TypeError('x'))
    await expect(api('/api/x')).rejects.toMatchObject({ code: 'NETWORK' })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('an HTTP error response still counts as reachable', async () => {
    setBackendUnreachable(true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })))
    await expect(api('/api/x')).rejects.toMatchObject({ status: 500 })
    const { result } = renderHook(() => useOnline())
    expect(result.current).toBe(true)
  })
})

describe('NetworkBanner / formatLastUpdated', () => {
  it('shows offline and unreachable texts, nothing when online', () => {
    render(<I18nProvider><NetworkBanner /></I18nProvider>)
    expect(screen.queryByTestId('network-banner')).toBeNull()
    act(() => setBackendUnreachable(true))
    expect(screen.getByTestId('network-banner')).toHaveTextContent('Kunde inte nå servern — försöker igen')
    act(() => {
      setNavigatorOnline(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByTestId('network-banner')).toHaveTextContent('Ingen anslutning')
  })

  it('formats HH:MM in Europe/Stockholm', () => {
    expect(formatLastUpdated(new Date('2026-01-15T13:32:00Z'))).toBe('14:32')
    expect(formatLastUpdated(new Date('2026-07-15T12:32:00Z'))).toBe('14:32')
  })
})
