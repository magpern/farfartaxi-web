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

export function isApiCode(err: unknown, code: string): boolean {
  return err instanceof ApiError && err.code === code
}

/** Friendly message for an action error: known 409 codes first, then the server text, then a generic one. */
export function apiErrorMessage(err: unknown, t: T): string {
  if (err instanceof ApiError && err.code && (CONFLICT_CODES as readonly string[]).includes(err.code)) {
    return t(`apiErrors.${err.code}`)
  }
  if (err instanceof Error && err.message) return err.message
  return t('errors.generic')
}
