import { API_URL, readStoredAuth, refreshSession, REFRESH_AHEAD_MS, tokenExpiresWithin } from './session'

/**
 * Privacy-first product telemetry (M8). Strict client-side allowlists mirror the backend contract
 * (`POST /api/telemetry/events`): unknown names/keys are dropped and anything that could carry an address,
 * coordinate, name, e-mail or phone is rejected. Never throws, never blocks the UI.
 */

export type BookingSource = 'home' | 'search' | 'favorite' | 'recent' | 'rebook'
export type TelemetryProps = Record<string, unknown>

type Kind = 'int' | 'string' | 'bookingKind' | 'bookingSource' | 'pushState' | 'cancelKind' | 'provider' | 'searchKind' | 'cancelStatus' | 'shortString' | 'errorType' | 'errorCode' | 'token' | 'hex16'

const BOOKING: Record<string, Kind> = { kind: 'bookingKind', source: 'bookingSource' }
const ALLOWLIST: Record<string, Record<string, Kind>> = {
  booking_started: BOOKING,
  booking_created: BOOKING,
  search_started: { queryLength: 'int' },
  search_result_selected: { provider: 'provider', kind: 'searchKind', rank: 'int', queryLength: 'int', latencyMs: 'int' },
  search_empty: { queryLength: 'int' },
  ride_accepted: {},
  ride_cancelled: { kind: 'bookingKind', status: 'cancelStatus' },
  push_permission: { state: 'pushState' },
  push_opened: { kind: 'shortString' },
  frontend_error: { type: 'errorType', source: 'token', code: 'errorCode', line: 'int', fingerprint: 'hex16' }
}

export const TELEMETRY_EVENT_NAMES = Object.keys(ALLOWLIST)
export const MAX_QUEUE = 200
export const MAX_BATCH = 50
export const FLUSH_INTERVAL_MS = 30_000
export const MAX_ERRORS_PER_SESSION = 10
const MAX_STRING = 60
const MAX_MESSAGE = 200
const ERROR_TYPES = ['TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'NetworkError', 'ChunkLoadError', 'Error', 'Other']
const ERROR_CODES = ['UNHANDLED_ERROR', 'UNHANDLED_REJECTION', 'RENDER_ERROR']
export type FrontendErrorCode = 'UNHANDLED_ERROR' | 'UNHANDLED_REJECTION' | 'RENDER_ERROR'
const TOKEN_RE = /^[A-Za-z0-9_.-]{1,40}$/
const HEX16_RE = /^[0-9a-f]{16}$/
const SESSION_KEY = 'farfartaxi-telemetry-sid'

const FORBIDDEN_KEY = /lat|lon|address|name|email|phone/i
const BOOKING_KINDS = ['NOW', 'SCHEDULED']
const BOOKING_SOURCES = ['home', 'search', 'favorite', 'recent', 'rebook']
const PUSH_STATES = ['granted', 'denied', 'default']
const CANCEL_KINDS = ['passenger', 'driver']
const PROVIDERS = ['SL', 'NOMINATIM', 'FAVORITE', 'RECENT']
const SEARCH_KINDS = ['STOP', 'ADDRESS', 'POI', 'FAVORITE', 'RECENT']
const CANCEL_STATUSES = ['by_passenger', 'by_driver']
const MAX_SHORT = 40
/** Anything that looks like a coordinate (3 digits max, separator, 4+ decimals). */
const COORD_RE = /\d{1,3}[.,]\d{4,}/

type QueuedEvent = { name: string; props: Record<string, string | number>; ts: string }

let queue: QueuedEvent[] = []
let sessionId: string | null = null
let inFlight = false
let errorCount = 0
const seenErrors = new Set<string>()
let bookingSource: BookingSource = 'home'

function hasManyDecimals(n: number): boolean {
  if (!Number.isFinite(n) || Number.isInteger(n)) return false
  const s = String(n)
  if (/e/i.test(s)) return true
  return (s.split('.')[1]?.length ?? 0) >= 4
}

function valid(kind: Kind, v: unknown): v is string | number {
  switch (kind) {
    case 'int':
      return typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= 2_147_483_647
    case 'string':
      return typeof v === 'string'
    case 'bookingKind':
      return typeof v === 'string' && BOOKING_KINDS.includes(v)
    case 'bookingSource':
      return typeof v === 'string' && BOOKING_SOURCES.includes(v)
    case 'pushState':
      return typeof v === 'string' && PUSH_STATES.includes(v)
    case 'cancelKind':
      return typeof v === 'string' && CANCEL_KINDS.includes(v)
    case 'provider':
      return typeof v === 'string' && PROVIDERS.includes(v)
    case 'searchKind':
      return typeof v === 'string' && SEARCH_KINDS.includes(v)
    case 'cancelStatus':
      return typeof v === 'string' && CANCEL_STATUSES.includes(v)
    case 'errorType':
      return typeof v === 'string' && ERROR_TYPES.includes(v)
    case 'errorCode':
      return typeof v === 'string' && ERROR_CODES.includes(v)
    case 'token':
      return typeof v === 'string' && TOKEN_RE.test(v)
    case 'hex16':
      return typeof v === 'string' && HEX16_RE.test(v)
    case 'shortString':
      return typeof v === 'string' && v.length > 0 && v.length <= MAX_SHORT
  }
}

/** Returns the cleaned props, or null when the whole event must be rejected. */
export function sanitizeEvent(name: string, props: TelemetryProps | undefined): Record<string, string | number> | null {
  if (!Object.prototype.hasOwnProperty.call(ALLOWLIST, name)) return null
  const allowed = ALLOWLIST[name]
  const out: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(props ?? {})) {
    if (FORBIDDEN_KEY.test(key)) return null
    if (typeof value === 'number' && hasManyDecimals(value)) return null
    if (typeof value === 'string' && COORD_RE.test(value)) return null
    const kind = allowed[key]
    if (!kind || !valid(kind, value)) continue
    out[key] = typeof value === 'string' && kind === 'string' ? value.slice(0, MAX_STRING) : value
  }
  return out
}

function getSessionId(): string {
  if (sessionId) return sessionId
  try {
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (stored) return (sessionId = stored)
  } catch {
    /* storage unavailable: in-memory id */
  }
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
  sessionId = id
  try {
    sessionStorage.setItem(SESSION_KEY, id)
  } catch {
    /* ignore */
  }
  return id
}

export function track(name: string, props?: TelemetryProps): void {
  try {
    const clean = sanitizeEvent(name, props)
    if (!clean) return
    queue.push({ name, props: clean, ts: new Date().toISOString() })
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE)
  } catch {
    /* telemetry must never throw */
  }
}

/** Where the current booking started (set by the UI entry points, read by booking_started / booking_created). */
export function setBookingSource(source: BookingSource): void {
  bookingSource = source
}
export function getBookingSource(): BookingSource {
  return bookingSource
}

async function post(token: string, batch: QueuedEvent[]): Promise<Response | null> {
  try {
    return await fetch(`${API_URL}/api/telemetry/events`, {
      method: 'POST',
      keepalive: true,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sessionId: getSessionId(), events: batch })
    })
  } catch {
    return null
  }
}

export async function flush(): Promise<void> {
  try {
    if (inFlight || queue.length === 0) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    let auth = readStoredAuth()
    if (!auth || auth.user?.approved === false) return
    inFlight = true
    try {
      let refreshed = false
      if (tokenExpiresWithin(auth.token, REFRESH_AHEAD_MS)) {
        refreshed = true
        if ((await refreshSession()) !== 'ok') return
        auth = readStoredAuth()
        if (!auth) return
      }
      while (queue.length > 0) {
        const batch = queue.splice(0, MAX_BATCH)
        let res = await post(auth.token, batch)
        if (res && res.status === 401 && !refreshed) {
          refreshed = true
          if ((await refreshSession()) === 'ok') {
            const next = readStoredAuth()
            if (next) {
              auth = next
              res = await post(auth.token, batch)
            }
          }
        }
        if (!res?.ok) {
          // Keep events on network errors, 5xx and auth failures; drop on other 4xx (bad payload).
          if (!res || res.status >= 500 || res.status === 401) queue = [...batch, ...queue].slice(-MAX_QUEUE)
          return
        }
      }
    } finally {
      inFlight = false
    }
  } catch {
    inFlight = false
  }
}

const URL_RE = /\b(?:https?|wss?|blob):\/\/[^\s'"<>)]+/gi
export function stripUrls(text: string): string {
  return text.replace(URL_RE, (u) => u.split(/[?#]/)[0]).replace(/(\/[^\s?#"'<>]*)[?#][^\s"'<>]*/g, '$1')
}

/** Normalizes a message so it only identifies the error shape: no URLs, digits or case/whitespace noise. */
export function normalizeMessage(message: string): string {
  return stripUrls(message)
    .replace(/\b(?:https?|wss?|blob):\/\/\S+/gi, '')
    .replace(/\/[^\s?#"'<>]*/g, '')
    .toLowerCase()
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
}

/** First 16 hex chars of SHA-256 of the normalized message. The raw message never leaves the device. */
export async function fingerprintMessage(message: string): Promise<string | null> {
  try {
    const data = new TextEncoder().encode(normalizeMessage(message))
    const digest = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(digest))
      .slice(0, 8)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return null
  }
}

export function classifyErrorType(err: unknown, message: string): string {
  const name = err instanceof Error ? err.name : ''
  if (ERROR_TYPES.includes(name) && name !== 'Other' && name !== 'Error') return name
  if (name === 'ChunkLoadError' || /loading (?:css )?chunk|dynamically imported module|importing a module script/i.test(message)) return 'ChunkLoadError'
  if (/networkerror|failed to fetch|load failed|network request failed/i.test(message)) return 'NetworkError'
  const m = /^(TypeError|ReferenceError|RangeError|SyntaxError)\b/.exec(message)
  if (m) return m[1]
  return name === 'Error' ? 'Error' : 'Other'
}

/** Stack frames only: the first line is dropped (Chromium puts "Name: message" there) and so is any non-frame line. */
export function stackFrames(stack: unknown): string | undefined {
  if (typeof stack !== 'string') return undefined
  const lines = stack.split('\n')
  const chromium = lines.some((l) => /^\s+at\s/.test(l))
  return (chromium ? lines.slice(1) : lines) // Firefox/Safari stacks have no header line
    .filter((l) => /^\s+at\s/.test(l) || /^[^\s]*@\S+:\d+(?::\d+)?$/.test(l.trim()))
    .join('\n')
}

/** Best-effort component/area token from a module file name (path and query dropped); "unknown" otherwise. */
export function deriveSource(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (typeof c !== 'string' || !c) continue
    const refs = c.match(/[^\s()@]*[A-Za-z0-9_.-]+\.(?:tsx?|jsx?|mjs)(?=[?#:)\s]|$)/g) ?? []
    for (const ref of refs) {
      const base = ref.split(/[?#]/)[0].split('/').pop() ?? ''
      const name = base.replace(/\.(?:tsx?|jsx?|mjs)$/, '').replace(/[^A-Za-z0-9_.-]/g, '')
      if (name && name !== 'index' && !/^\d/.test(name)) return name.slice(0, 40)
    }
  }
  return 'unknown'
}

/**
 * Records a sanitized frontend error: type, source token, code, line and a message fingerprint only.
 * `error` may be an Error, string or ErrorEvent message; `source` a script file name or stack.
 */
export function trackFrontendError(error: unknown, source?: unknown, line?: unknown, code: FrontendErrorCode = 'UNHANDLED_ERROR'): void {
  try {
    if (errorCount >= MAX_ERRORS_PER_SESSION) return
    const raw = typeof error === 'string' ? error : error instanceof Error ? error.message : String(error ?? '')
    const msg = stripUrls(raw).slice(0, MAX_MESSAGE)
    if (!msg || seenErrors.has(msg)) return
    seenErrors.add(msg)
    errorCount++
    const props: TelemetryProps = {
      type: classifyErrorType(error, raw),
      source: deriveSource(error instanceof Error ? stackFrames(error.stack) : undefined, source),
      code
    }
    if (typeof line === 'number' && Number.isInteger(line)) props.line = line
    void fingerprintMessage(raw).then((fingerprint) => {
      if (fingerprint) props.fingerprint = fingerprint
      track('frontend_error', props)
    })
  } catch {
    /* ignore */
  }
}

/** Hook point for a React error boundary's componentDidCatch (none exists yet). */
export function trackRenderError(error: unknown): void {
  trackFrontendError(error, undefined, undefined, 'RENDER_ERROR')
}

let installed = false
/** Registers the flush timer, lifecycle flushes and global error capture. Idempotent; call once at startup. */
export function initTelemetry(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.setInterval(() => void flush(), FLUSH_INTERVAL_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush()
  })
  window.addEventListener('pagehide', () => void flush())
  window.addEventListener('online', () => void flush())
  window.addEventListener('error', (e: ErrorEvent) => trackFrontendError(e.error ?? e.message, e.filename, e.lineno, 'UNHANDLED_ERROR'))
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const r = e.reason as unknown
    trackFrontendError(r instanceof Error || typeof r === 'string' ? r : 'unhandledrejection', undefined, undefined, 'UNHANDLED_REJECTION')
  })
}

/** Test helper. */
export function __resetTelemetry(): void {
  queue = []
  sessionId = null
  inFlight = false
  errorCount = 0
  seenErrors.clear()
  bookingSource = 'home'
}
export function __queueSnapshot(): QueuedEvent[] {
  return queue.slice()
}
