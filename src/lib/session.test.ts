import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { api } from '../api/client'
import {
  AUTH_STORAGE_KEY,
  ensureFreshSession,
  registerSessionExpiredHandler,
  logoutRemote
} from './session'

function jwt(expInSec: number): string {
  const b64 = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expInSec }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `h.${b64}.s`
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const user = { id: 1, email: 'a@b.c' }
const store = (token: string) => localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, user }))
const stored = () => (JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? 'null') as { token: string } | null)?.token

let fetchMock: ReturnType<typeof vi.fn>
const calls = (suffix: string) => fetchMock.mock.calls.filter((c) => String(c[0]).endsWith(suffix))
const authHeader = (c: unknown[]) => ((c[1] as RequestInit).headers as Record<string, string>).Authorization

describe('session refresh', () => {
  const expired = jwt(-100)
  const fresh = jwt(3600)
  let onExpired: Mock<() => void>

  beforeEach(() => {
    localStorage.clear()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    onExpired = vi.fn<() => void>()
    registerSessionExpiredHandler(onExpired)
  })
  afterEach(() => {
    registerSessionExpiredHandler(undefined)
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('401 -> refresh -> retries the request with the new token', async () => {
    store(expired)
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/api/auth/refresh')) return json(200, { token: fresh, user })
      const h = (init.headers as Record<string, string>).Authorization
      return h === `Bearer ${fresh}` ? json(200, { ok: 1 }) : json(401, {})
    })
    await expect(api('/api/rides', { token: expired })).resolves.toEqual({ ok: 1 })
    expect(calls('/api/auth/refresh')).toHaveLength(1)
    expect(calls('/api/rides')).toHaveLength(2)
    expect(authHeader(calls('/api/rides')[1])).toBe(`Bearer ${fresh}`)
    expect(stored()).toBe(fresh)
    expect(onExpired).not.toHaveBeenCalled()
    expect((calls('/api/auth/refresh')[0][1] as RequestInit).credentials).toBe('same-origin')
  })

  it('concurrent 401s trigger exactly one refresh', async () => {
    store(expired)
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/api/auth/refresh')) {
        await new Promise((r) => setTimeout(r, 20))
        return json(200, { token: fresh, user })
      }
      const h = (init.headers as Record<string, string>).Authorization
      return h === `Bearer ${fresh}` ? json(200, { ok: 1 }) : json(401, {})
    })
    const res = await Promise.all([
      api('/api/a', { token: expired }),
      api('/api/b', { token: expired }),
      api('/api/c', { token: expired })
    ])
    expect(res).toHaveLength(3)
    expect(calls('/api/auth/refresh')).toHaveLength(1)
  })

  it('REFRESH_RACE picks up the other tab token and retries without logging out', async () => {
    store(expired)
    const other = jwt(3000)
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/api/auth/refresh')) {
        store(other) // another tab stored its freshly refreshed token
        return json(401, { code: 'REFRESH_RACE' })
      }
      const h = (init.headers as Record<string, string>).Authorization
      return h === `Bearer ${other}` ? json(200, { ok: 2 }) : json(401, {})
    })
    await expect(api('/api/rides', { token: expired })).resolves.toEqual({ ok: 2 })
    expect(calls('/api/auth/refresh')).toHaveLength(1)
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('REFRESH_RACE without a newer token waits then refreshes once more', async () => {
    vi.useFakeTimers()
    store(expired)
    let n = 0
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/api/auth/refresh')) {
        return n++ === 0 ? json(401, { code: 'REFRESH_RACE' }) : json(200, { token: fresh, user })
      }
      const h = (init.headers as Record<string, string>).Authorization
      return h === `Bearer ${fresh}` ? json(200, { ok: 3 }) : json(401, {})
    })
    const p = api('/api/rides', { token: expired })
    await vi.advanceTimersByTimeAsync(600)
    await expect(p).resolves.toEqual({ ok: 3 })
    expect(calls('/api/auth/refresh')).toHaveLength(2)
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('REFRESH_INVALID calls the session-expired handler', async () => {
    store(expired)
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/api/auth/refresh') ? json(401, { code: 'REFRESH_INVALID' }) : json(401, {})
    )
    await expect(api('/api/rides', { token: expired })).rejects.toThrow()
    expect(onExpired).toHaveBeenCalledTimes(1)
  })

  it('network failure during refresh does not log out', async () => {
    store(expired)
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/auth/refresh')) throw new TypeError('offline')
      return json(401, {})
    })
    await expect(api('/api/rides', { token: expired })).rejects.toThrow()
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('does not refresh for auth endpoints or token-less requests', async () => {
    fetchMock.mockResolvedValue(json(401, { error: 'bad' }))
    await expect(api('/api/auth/login', { token: 'x', method: 'POST' })).rejects.toThrow('bad')
    await expect(api('/api/public/x')).rejects.toThrow()
    expect(calls('/api/auth/refresh')).toHaveLength(0)
  })

  it('expired token at startup: refresh is attempted before any logout', async () => {
    store(expired)
    fetchMock.mockResolvedValue(json(200, { token: fresh, user }))
    await expect(ensureFreshSession()).resolves.toBe('ok')
    expect(stored()).toBe(fresh)
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('expired token at startup + invalid cookie: session-expired after the refresh attempt', async () => {
    store(expired)
    fetchMock.mockResolvedValue(json(401, { code: 'REFRESH_INVALID' }))
    await expect(ensureFreshSession()).resolves.toBe('invalid')
    expect(calls('/api/auth/refresh')).toHaveLength(1)
    expect(onExpired).toHaveBeenCalledTimes(1)
  })

  it('proactively refreshes when under 5 minutes remain, not otherwise', async () => {
    store(jwt(120))
    fetchMock.mockResolvedValue(json(200, { token: fresh, user }))
    await expect(ensureFreshSession()).resolves.toBe('ok')
    expect(calls('/api/auth/refresh')).toHaveLength(1)
    await expect(ensureFreshSession()).resolves.toBe('fresh')
    expect(calls('/api/auth/refresh')).toHaveLength(1)
  })

  it('logoutRemote posts to /api/auth/logout and swallows network errors', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    await expect(logoutRemote('t')).resolves.toBeUndefined()
    expect(calls('/api/auth/logout')).toHaveLength(1)
  })
})
