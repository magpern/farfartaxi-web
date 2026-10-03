import type { RideStatus } from './rideTypes'

export const ALL_RIDE_STATUSES: readonly RideStatus[] = [
  'REQUESTED',
  'ACCEPTED',
  'EN_ROUTE',
  'ARRIVED',
  'PICKED_UP',
  'COMPLETED',
  'CANCELLED',
  'NO_DRIVER'
]

type T = (key: string, vars?: Record<string, string | number>) => string

export type StatusPerspective = 'passenger' | 'driver'

export function rideStatusKey(status: string, perspective: StatusPerspective = 'passenger'): string {
  const known = (ALL_RIDE_STATUSES as readonly string[]).includes(status)
  const group = perspective === 'driver' ? 'rideStatusDriver' : 'rideStatus'
  return known ? `${group}.${status}` : 'rideStatus.UNKNOWN'
}

/** Friendly label for a ride status; never returns the raw enum. */
export function rideStatusLabel(t: T, status: string, perspective: StatusPerspective = 'passenger'): string {
  return t(rideStatusKey(status, perspective))
}
