type T = (key: string, vars?: Record<string, string | number>) => string

function getErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message
  return ''
}

/** Maps backend validation text to localized toast copy for booking. */
export function bookingApiErrorMessage(err: unknown, t: T) {
  const msg = getErrorMessage(err)
  if (!msg) return t('errors.generic')
  const lower = msg.toLowerCase()
  if (lower.includes('(401)') || lower.includes('401') || lower.includes('not authenticated')) {
    return t('errors.sessionExpired')
  }
  if (lower.includes('future') || lower.includes('scheduledat')) {
    return t('errors.bookingFuture')
  }
  return t('errors.bookingFailed', { message: msg })
}
