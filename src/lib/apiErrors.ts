import { ApiError } from '../api/client'

type T = (key: string, vars?: Record<string, string | number>) => string

export const CONFLICT_CODES = [
  'RIDE_TAKEN',
  'RIDE_CANCELLED',
  'RIDE_CHANGED',
  'OFFER_CLOSED',
  'CONFIRM_REQUIRED',
  'ALL_DECLINED',
  'EDIT_NOT_ALLOWED',
  'PROXIMITY_WARNING',
  'INVALID_TRANSITION'
] as const

/** True for a failed/unreachable request (no response from the server). */
export function isNetworkError(err: unknown): boolean {
  return (err instanceof ApiError && (err.code === 'NETWORK' || err.code === 'TIMEOUT' || err.status === 0)) || err instanceof TypeError
}

export function isApiCode(err: unknown, code: string): boolean {
  return err instanceof ApiError && err.code === code
}

/** Friendly message for an action error. Known codes map to i18n text; raw server text is never shown. */
export function apiErrorMessage(err: unknown, t: T): string {
  if (isNetworkError(err)) return t('network.actionFailed')
  if (err instanceof ApiError) {
    if (err.code && (CONFLICT_CODES as readonly string[]).includes(err.code)) return t(`apiErrors.${err.code}`)
    return t('errors.generic')
  }
  // fetch() rejects with a TypeError when the network is unreachable.
  return t('errors.generic')
}
