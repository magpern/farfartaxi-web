/** JWT `exp` is seconds since epoch; used so we do not treat an expired token as a logged-in session. */
export function isJwtExpired(token: string, skewMs = 60_000): boolean {
  const parts = token.split('.')
  if (parts.length < 2) return true
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded)) as { exp?: number }
    if (payload.exp == null || typeof payload.exp !== 'number') return true
    return Date.now() >= payload.exp * 1000 - skewMs
  } catch {
    return true
  }
}

