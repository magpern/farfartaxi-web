import { jwtMsRemaining } from './jwt'

export const AUTH_STORAGE_KEY = 'farfartaxi-auth'
const REFRESH_LOCK_KEY = 'farfartaxi-refresh-lock'
const LOCK_TTL_MS = 8_000
/** Refresh silently when the access token has less than this left. */
export const REFRESH_AHEAD_MS = 5 * 60_000
const RACE_WAIT_MS = 500
const CROSS_TAB_WAIT_MS = 1_500

// In dev, always use same-origin `/api/...` so Vite's proxy reaches the backend.
// A set VITE_API_URL (e.g. http://localhost:8080) bypasses the proxy and often causes
// net::ERR_CONNECTION_REFUSED if the browser cannot reach that host:port.
export const API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export type RefreshResult = 'ok' | 'invalid' | 'error'

type StoredAuth = { token: string; user: Record<string, unknown> }

let sessionExpiredHandler: (() => void) | undefined
export function registerSessionExpiredHandler(handler: (() => void) | undefined) {
  sessionExpiredHandler = handler
}
export function notifySessionExpired() {
  sessionExpiredHandler?.()
}

const listeners = new Set<() => void>()
/** Called whenever the stored auth changes (own refresh, or another tab via the storage event). */
export function subscribeAuthChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
function emitAuthChange() {
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === AUTH_STORAGE_KEY || e.key === null) emitAuthChange()
  })
}

export function readStoredAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredAuth
    return parsed && typeof parsed.token === 'string' ? parsed : null
  } catch {
    return null
  }
}

/** True when the token is expired or has less than `withinMs` left (garbage counts as expired). */
export function tokenExpiresWithin(token: string, withinMs: number): boolean {
  const left = jwtMsRemaining(token)
  return left == null || left <= withinMs
}

function storeRefreshed(token: string, user: Record<string, unknown> | undefined) {
  const prev = readStoredAuth()
  const next = { ...(prev ?? {}), token, user: { ...(prev?.user ?? {}), ...(user ?? {}) } }
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  emitAuthChange()
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const tabId = Math.random().toString(36).slice(2)

function lockHeldByOtherTab(): boolean {
  try {
    const raw = localStorage.getItem(REFRESH_LOCK_KEY)
    if (!raw) return false
    const [id, ts] = raw.split('@')
    return id !== tabId && Date.now() - Number(ts) < LOCK_TTL_MS
  } catch {
    return false
  }
}
function takeLock() {
  try {
    localStorage.setItem(REFRESH_LOCK_KEY, `${tabId}@${Date.now()}`)
  } catch {
    /* ignore */
  }
}
function releaseLock() {
  try {
    const raw = localStorage.getItem(REFRESH_LOCK_KEY)
    if (raw?.startsWith(`${tabId}@`)) localStorage.removeItem(REFRESH_LOCK_KEY)
  } catch {
    /* ignore */
  }
}

/** Another tab stored a token different from `baseline` that is still usable. */
function newerStoredToken(baseline: string | undefined): boolean {
  const s = readStoredAuth()
  return !!s && s.token !== baseline && !tokenExpiresWithin(s.token, 0)
}

async function callRefresh(): Promise<{ status: 'ok' | 'invalid' | 'race' | 'error' }> {
  let res: Response
  try {
    res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    })
  } catch {
    return { status: 'error' }
  }
  if (res.ok) {
    try {
      const body = (await res.json()) as { token?: string; user?: Record<string, unknown> }
      if (!body.token) return { status: 'error' }
      storeRefreshed(body.token, body.user)
      return { status: 'ok' }
    } catch {
      return { status: 'error' }
    }
  }
  if (res.status === 401) {
    let code = ''
    try {
      code = ((await res.json()) as { code?: string }).code ?? ''
    } catch {
      /* ignore */
    }
    return { status: code === 'REFRESH_RACE' ? 'race' : 'invalid' }
  }
  return { status: 'error' }
}

async function doRefresh(): Promise<RefreshResult> {
  const baseline = readStoredAuth()?.token

  // Cross-tab guard: if another tab is refreshing right now, wait for its token instead of stampeding.
  if (lockHeldByOtherTab()) {
    const deadline = Date.now() + CROSS_TAB_WAIT_MS
    while (Date.now() < deadline && lockHeldByOtherTab()) {
      if (newerStoredToken(baseline)) return 'ok'
      await sleep(100)
    }
    if (newerStoredToken(baseline)) return 'ok'
  }

  takeLock()
  try {
    let r = await callRefresh()
    if (r.status === 'race') {
      // Someone else (another tab / the service worker) rotated the cookie a moment ago.
      if (newerStoredToken(baseline)) return 'ok'
      await sleep(RACE_WAIT_MS)
      if (newerStoredToken(baseline)) return 'ok'
      r = await callRefresh()
      if (r.status === 'race') return newerStoredToken(baseline) ? 'ok' : 'error'
    }
    return r.status === 'ok' ? 'ok' : r.status === 'invalid' ? 'invalid' : 'error'
  } finally {
    releaseLock()
  }
}

let inflight: Promise<RefreshResult> | null = null

/** Single-flight refresh: all callers in this tab share one request. Never logs out by itself. */
export function refreshSession(): Promise<RefreshResult> {
  if (!inflight) {
    inflight = doRefresh().finally(() => {
      inflight = null
    })
  }
  return inflight
}

/**
 * Refresh silently if the stored access token is expired or expires soon.
 * Calls the session-expired handler only when the refresh cookie is rejected.
 */
export async function ensureFreshSession(): Promise<'none' | 'fresh' | RefreshResult> {
  const stored = readStoredAuth()
  if (!stored) return 'none'
  if (!tokenExpiresWithin(stored.token, REFRESH_AHEAD_MS)) return 'fresh'
  const r = await refreshSession()
  if (r === 'invalid') notifySessionExpired()
  return r
}

/**
 * After a 401 for `sentToken`: return a token to retry with, or null.
 * Notifies session-expired only on REFRESH_INVALID.
 */
export async function recoverFromUnauthorized(sentToken: string): Promise<string | null> {
  const stored = readStoredAuth()
  if (stored && stored.token !== sentToken && !tokenExpiresWithin(stored.token, 0)) return stored.token
  const r = await refreshSession()
  if (r === 'ok') return readStoredAuth()?.token ?? null
  if (r === 'invalid') notifySessionExpired()
  return null
}

/** Revoke the refresh cookie server-side; network errors are ignored. */
export async function logoutRemote(token?: string): Promise<void> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 3_000)
  try {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: ctrl.signal
    })
  } catch {
    /* ignore */
  } finally {
    clearTimeout(timer)
  }
}
