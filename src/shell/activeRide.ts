import { DRIVING_STATUSES, type ActiveRideResponse } from '../lib/rideTypes'

/** Screen a user should land on for their active ride, or null when it should not force a redirect. */
export function activeRideTarget(active: ActiveRideResponse | null | undefined): string | null {
  if (!active) return null
  const { role, ride } = active
  if (role === 'PASSENGER') return `/app/resa/${ride.id}`
  // An ACCEPTED ride (starting within 60 min) is shown prominently on driver home, never force-redirected.
  return DRIVING_STATUSES.includes(ride.status) ? `/app/forare/kor/${ride.id}` : null
}

export const HOME_PATHS: readonly string[] = ['/app', '/app/forare']

export function isHomePath(pathname: string): boolean {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return HOME_PATHS.includes(p)
}

/**
 * The global invariant: an active ride IS the home screen. We redirect only on *entry* (app start or
 * resume from background, `armed`) while the user is on a home path, so tabs still let people leave.
 */
export function decideActiveRideRedirect(opts: {
  active: ActiveRideResponse | null | undefined
  pathname: string
  armed: boolean
}): string | null {
  if (!opts.armed || !isHomePath(opts.pathname)) return null
  const target = activeRideTarget(opts.active)
  return target && target !== opts.pathname ? target : null
}

const POINTER_KEY = (userId: number) => `farfartaxi-active-pointer:${userId}`
const POINTER_MAX_AGE_MS = 6 * 60 * 60 * 1000

/** Last known active ride (id + role) so a cold start with no connection can still open the ride screen. */
export function writeActivePointer(userId: number, active: ActiveRideResponse | null): void {
  try {
    if (!active) localStorage.removeItem(POINTER_KEY(userId))
    else
      localStorage.setItem(
        POINTER_KEY(userId),
        JSON.stringify({ role: active.role, id: active.ride.id, status: active.ride.status, at: Date.now() })
      )
  } catch {
    /* ignore */
  }
}

export function readActivePointer(userId: number, now = Date.now()): { role: 'PASSENGER' | 'DRIVER'; id: number; status: string } | null {
  try {
    const raw = localStorage.getItem(POINTER_KEY(userId))
    if (!raw) return null
    const o = JSON.parse(raw) as { role?: string; id?: number; status?: string; at?: number }
    if (typeof o.id !== 'number' || typeof o.at !== 'number' || now - o.at > POINTER_MAX_AGE_MS) return null
    if (o.role !== 'PASSENGER' && o.role !== 'DRIVER') return null
    return { role: o.role, id: o.id, status: String(o.status ?? '') }
  } catch {
    return null
  }
}

/** True when nothing a consumer renders has changed (avoids re-rendering every poll). */
export function sameActive(a: ActiveRideResponse | null, b: ActiveRideResponse | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.role === b.role && JSON.stringify(a.ride) === JSON.stringify(b.ride)
}
