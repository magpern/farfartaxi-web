import { API_URL, readStoredAuth } from './session'

/**
 * Privacy-first product telemetry (M8). Strict client-side allowlists mirror the backend contract
 * (`POST /api/telemetry/events`): unknown names/keys are dropped and anything that could carry an address,
 * coordinate, name, e-mail or phone is rejected. Never throws, never blocks the UI.
 */

export type BookingSource = 'home' | 'search' | 'favorite' | 'recent' | 'rebook'
export type TelemetryProps = Record<string, unknown>

type Kind = 'int' | 'string' | 'bookingKind' | 'bookingSource' | 'pushState' | 'cancelKind'

const BOOKING: Record<string, Kind> = { kind: 'bookingKind', source: 'bookingSource' }
const ALLOWLIST: Record<string, Record<string, Kind>> = {
  booking_started: BOOKING,
  booking_created: BOOKING,
  search_started: { queryLength: 'int' },
  search_result_selected: { provider: 'string', kind: 'string', rank: 'int', queryLength: 'int', latencyMs: 'int' },
  search_empty: { queryLength: 'int' },
  ride_accepted: {},
  ride_cancelled: { kind: 'bookingKind', status: 'string' },
  push_permission: { state: 'pushState' },
  push_opened: {},
  frontend_error: { message: 'string', source: 'string', line: 'int' }
}

export const TELEMETRY_EVENT_NAMES = Object.keys(ALLOWLIST)
export const MAX_QUEUE = 200
export const MAX_BATCH = 50
export const FLUSH_INTERVAL_MS = 30_000
export const MAX_ERRORS_PER_SESSION = 10
const MAX_STRING = 60
const MAX_MESSAGE = 200
const MAX_SOURCE = 120
const SESSION_KEY = 'farfartaxi-telemetry-sid'

const FORBIDDEN_KEY = /lat|lon|address|name|email|phone/i
const BOOKING_KINDS = ['NOW', 'SCHEDULED']
const BOOKING_SOURCES = ['home', 'search', 'favorite', 'recent', 'rebook']
const PUSH_STATES = ['granted', 'denied', 'default']
const CANCEL_KINDS = ['passenger', 'driver']

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
    const kind = allowed[key]
    if (!kind || !valid(kind, value)) continue
    out[key] = typeof value === 'string' && kind === 'string' ? value.slice(0, name === 'frontend_error' ? (key === 'message' ? MAX_MESSAGE : MAX_SOURCE) : MAX_STRING) : value
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

export async function flush(): Promise<void> {
  try {
    if (inFlight || queue.length === 0) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    const auth = readStoredAuth()
    if (!auth || auth.user?.approved === false) return
    inFlight = true
    try {
      while (queue.length > 0) {
        const batch = queue.splice(0, MAX_BATCH)
        let ok = false
        let retry = false
        try {
          const res = await fetch(`${API_URL}/api/telemetry/events`, {
            method: 'POST',
            keepalive: true,
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
            body: JSON.stringify({ sessionId: getSessionId(), events: batch })
          })
          ok = res.ok
          retry = res.status >= 500
        } catch {
          retry = true
        }
        if (!ok) {
          if (retry) queue = [...batch, ...queue].slice(-MAX_QUEUE)
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
  return text.replace(URL_RE, (u) => u.split(/[?#]/)[0])
}

export function trackFrontendError(message: unknown, source?: unknown, line?: unknown): void {
  try {
    if (errorCount >= MAX_ERRORS_PER_SESSION) return
    const msg = stripUrls(typeof message === 'string' ? message : message instanceof Error ? message.message : String(message ?? '')).slice(0, MAX_MESSAGE)
    if (!msg || seenErrors.has(msg)) return
    seenErrors.add(msg)
    errorCount++
    const props: TelemetryProps = { message: msg }
    if (typeof source === 'string' && source) props.source = stripUrls(source).slice(0, MAX_SOURCE)
    if (typeof line === 'number' && Number.isInteger(line)) props.line = line
    track('frontend_error', props)
  } catch {
    /* ignore */
  }
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
  window.addEventListener('error', (e: ErrorEvent) => trackFrontendError(e.message, e.filename, e.lineno))
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const r = e.reason as unknown
    trackFrontendError(r instanceof Error ? r.message : typeof r === 'string' ? r : 'unhandledrejection', 'unhandledrejection')
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
