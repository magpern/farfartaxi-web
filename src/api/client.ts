import { API_URL, notifySessionExpired, recoverFromUnauthorized } from '../lib/session'

let pendingApprovalHandler: (() => void) | undefined
export function registerPendingApprovalHandler(handler: (() => void) | undefined) {
  pendingApprovalHandler = handler
}

/** Auth endpoints never trigger refresh-and-retry. */
const NO_REFRESH_PATHS = /\/api\/auth\/(refresh|login|register|google|logout)(\?|$)/

type ApiOpts = { method?: string; token?: string; body?: string }

function send(url: string, opts: ApiOpts, token: string | undefined) {
  return fetch(url, {
    method: opts.method ?? 'GET',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: opts.body
  })
}

export async function api<T = unknown>(path: string, opts: ApiOpts = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`
  let response = await send(url, opts, opts.token)

  if (response.status === 401 && opts.token && !NO_REFRESH_PATHS.test(path)) {
    const fresh = await recoverFromUnauthorized(opts.token)
    if (fresh) {
      response = await send(url, opts, fresh)
      if (response.status === 401) notifySessionExpired()
    }
  }

  if (!response.ok) {
    let text = `Request failed (${response.status})`
    try {
      const payload = (await response.json()) as { error?: string; code?: string }
      if (response.status === 403 && payload.code === 'PENDING_APPROVAL' && opts.token) {
        pendingApprovalHandler?.()
      }
      if (payload.error) text = payload.error
    } catch {
      // ignored
    }
    throw new Error(text)
  }
  if (response.status === 204) return undefined as T
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return undefined as T
  return (await response.json()) as T
}
