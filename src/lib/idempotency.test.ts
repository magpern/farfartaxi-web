import { describe, expect, it } from 'vitest'
import { createIdempotencyHolder } from './idempotency'

describe('createIdempotencyHolder', () => {
  it('reuses the key for the same payload and renews on change or reset', () => {
    const h = createIdempotencyHolder()
    const a = h.keyFor({ x: 1 })
    expect(a.length).toBeGreaterThan(0)
    expect(a.length).toBeLessThanOrEqual(64)
    expect(h.keyFor({ x: 1 })).toBe(a)
    const b = h.keyFor({ x: 2 })
    expect(b).not.toBe(a)
    h.reset()
    expect(h.keyFor({ x: 2 })).not.toBe(b)
  })
})
