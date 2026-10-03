import { setBackendUnreachable } from '../lib/network/state'
import { API_URL, notifySessionExpired, recoverFromUnauthorized } from '../lib/session'

let pendingApprovalHandler: (() => void) | undefined
export function registerPendingApprovalHandler(handler: (() => void) | undefined) {
  pendingApprovalHandler = handler
}

/** Auth endpoints never trigger refresh-and-retry. */
const NO_REFRESH_PATHS = /\/api\/auth\/(refresh|login|register|google|logout)(\?|$)/

/** Error from a non-2xx response; carries the HTTP status, the contract `code` and the parsed body. */
export class ApiError extends Error {
  status: number
  code?: string
  body?: Record<string, unknown>
  constructor(message: string, status: number, code?: string, body?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.body = body
  }
}

export const DEFAULT_TIMEOUT_MS = 12_000

type ApiOpts = {
  method?: string
  token?: string
  body?: string
  headers?: Record<string, string>
  /** Abort and throw ApiError(status 0, code TIMEOUT) after this many ms (default 12 s). */
  timeoutMs?: number
}

function networkError(code: 'NETWORK' | 'TIMEOUT'): ApiError {
  return new ApiError(code === 'TIMEOUT' ? 'Request timed out' : 'Network error', 0, code)
}

async function send(url: string, opts: ApiOpts, token: string | undefined): Promise<Response> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: opts.method ?? 'GET',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...opts.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: opts.body,
      signal: controller.signal
    })
    // 502/503/504 come from the reverse proxy while the backend restarts: treat as unreachable.
    setBackendUnreachable(response.status === 502 || response.status === 503 || response.status === 504)
    return response
  } catch {
    setBackendUnreachable(true)
    throw networkError(timedOut ? 'TIMEOUT' : 'NETWORK')
  } finally {
    clearTimeout(timer)
  }
}

/** Only idempotent reads are retried (once, on a plain network error). Mutations are never retried or queued. */
async function sendWithRetry(url: string, opts: ApiOpts, token: string | undefined): Promise<Response> {
  const isGet = (opts.method ?? 'GET').toUpperCase() === 'GET'
  try {
    return await send(url, opts, token)
  } catch (e) {
    if (isGet && e instanceof ApiError && e.code === 'NETWORK') return send(url, opts, token)
    throw e
  }
}

let inFlightMutations = 0
/** Number of non-GET api() calls currently in flight; the PWA update guard must not reload while > 0. */
export function getInFlightMutations(): number {
  return inFlightMutations
}

export async function api<T = unknown>(path: string, opts: ApiOpts = {}): Promise<T> {
  const isMutation = (opts.method ?? 'GET').toUpperCase() !== 'GET'
  if (!isMutation) return apiInner<T>(path, opts)
  inFlightMutations += 1
  try {
    return await apiInner<T>(path, opts)
  } finally {
    inFlightMutations -= 1
  }
}

async function apiInner<T>(path: string, opts: ApiOpts): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`
  let response = await sendWithRetry(url, opts, opts.token)

  if (response.status === 401 && opts.token && !NO_REFRESH_PATHS.test(path)) {
    const fresh = await recoverFromUnauthorized(opts.token)
    if (fresh) {
      response = await sendWithRetry(url, opts, fresh)
      if (response.status === 401) notifySessionExpired()
    }
  }

  if (!response.ok) {
    let text = `Request failed (${response.status})`
    let code: string | undefined
    let body: Record<string, unknown> | undefined
    try {
      const payload = (await response.json()) as { error?: string; code?: string }
      code = payload.code
      body = payload as Record<string, unknown>
      if (response.status === 403 && payload.code === 'PENDING_APPROVAL' && opts.token) {
        pendingApprovalHandler?.()
      }
      if (payload.error) text = payload.error
    } catch {
      // ignored
    }
    throw new ApiError(text, response.status, code, body)
  }
  if (response.status === 204) return undefined as T
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return undefined as T
  return (await response.json()) as T
}
