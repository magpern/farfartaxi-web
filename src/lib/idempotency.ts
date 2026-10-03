/**
 * One Idempotency-Key per booking attempt. A retry of the same payload (e.g. after a network
 * error) reuses the key so the server never creates a second ride; a changed payload gets a new key.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function createIdempotencyHolder() {
  let fingerprint: string | null = null
  let key: string | null = null
  return {
    keyFor(payload: unknown): string {
      const fp = JSON.stringify(payload)
      if (key === null || fp !== fingerprint) {
        fingerprint = fp
        key = newIdempotencyKey()
      }
      return key
    },
    /** Call after a successful booking so the next booking gets a fresh key. */
    reset() {
      fingerprint = null
      key = null
    }
  }
}
