import { DRIVING_STATUSES } from './rideTypes'

export type LatLon = { lat: number; lon: number }
export type EtaTarget = 'PICKUP' | 'DESTINATION'

/** Smooth marker movement between two positions takes about this long. */
export const TWEEN_MS = 1000
/** The accuracy circle is only drawn when the fix is worse than this. */
export const ACCURACY_CIRCLE_MIN_M = 100
/** Position older than this is shown as stale. */
export const STALE_AFTER_MS = 120_000

/** Position of the marker `elapsedMs` into a tween (ease-in-out, clamped, never overshoots). */
export function tweenPoint(from: LatLon, to: LatLon, elapsedMs: number, durationMs = TWEEN_MS): LatLon {
  if (durationMs <= 0 || elapsedMs >= durationMs) return to
  if (elapsedMs <= 0) return from
  const x = elapsedMs / durationMs
  const k = x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2
  return { lat: from.lat + (to.lat - from.lat) * k, lon: from.lon + (to.lon - from.lon) * k }
}

export function showAccuracyCircle(accuracyM: number | null | undefined): boolean {
  return accuracyM != null && Number.isFinite(accuracyM) && accuracyM > ACCURACY_CIRCLE_MIN_M
}

export function isDrivingStatus(status: string): boolean {
  return DRIVING_STATUSES.includes(status)
}

/** Where the car is heading: the pickup until the passenger is in the car. */
export function targetForStatus(status: string): EtaTarget {
  return status === 'PICKED_UP' ? 'DESTINATION' : 'PICKUP'
}

export type StatusLine = { key: string; vars: Record<string, number> } | null

/**
 * Headline for the live status. The ETA minutes are only shown when they are measured to the stop that matches the
 * status (a leftover pickup ETA must not be presented as "arrival at destination").
 */
export function statusLine(status: string, etaTarget: EtaTarget | null | undefined, etaMinutes: number | null | undefined): StatusLine {
  const hasEta = etaMinutes != null && etaMinutes > 0 && (etaTarget == null || etaTarget === targetForStatus(status))
  const min = hasEta ? Math.max(1, Math.round(etaMinutes)) : 0
  switch (status) {
    case 'EN_ROUTE':
      return hasEta ? { key: 'live.enRouteEta', vars: { min } } : { key: 'live.enRoute', vars: {} }
    case 'ARRIVED':
      return { key: 'live.arrived', vars: {} }
    case 'PICKED_UP':
      return hasEta ? { key: 'live.pickedUpEta', vars: { min } } : { key: 'live.pickedUp', vars: {} }
    default:
      return null
  }
}

export function secondsSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now - t) / 1000))
}

export type Ago = { key: 'live.updatedAgoSec' | 'live.updatedAgoMin'; n: number }
/** "uppdaterad för 20 s sedan" / "… 3 min sedan". */
export function relativeAgo(seconds: number): Ago {
  return seconds < 60 ? { key: 'live.updatedAgoSec', n: seconds } : { key: 'live.updatedAgoMin', n: Math.floor(seconds / 60) }
}

export type Stale = { minutes: number | null } | null
/**
 * Stale = the server flagged it, or no update for more than 2 min. Only while the car should be moving.
 * `minutes` is null when no position has ever arrived.
 */
export function staleState(status: string, locationStale: boolean | null | undefined, lastLocationAt: string | null | undefined, now: number): Stale {
  if (!isDrivingStatus(status)) return null
  const secs = secondsSince(lastLocationAt, now)
  if (secs === null) return locationStale ? { minutes: null } : null
  if (!locationStale && secs * 1000 <= STALE_AFTER_MS) return null
  return { minutes: Math.max(2, Math.floor(secs / 60)) }
}
