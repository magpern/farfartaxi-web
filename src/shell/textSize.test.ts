import { describe, expect, it } from 'vitest'
import { readLargeText, rootFontPx, writeLargeText } from './textSize'

describe('Stor text', () => {
  it('drivers start at 20px or more; large text adds more', () => {
    expect(rootFontPx('USER', false)).toBe(16)
    expect(rootFontPx('USER', true)).toBeGreaterThan(16)
    expect(rootFontPx('DRIVER', false)).toBeGreaterThanOrEqual(20)
    expect(rootFontPx('ADMIN', true)).toBeGreaterThan(rootFontPx('ADMIN', false))
  })
  it('persists per user', () => {
    writeLargeText(1, true)
    expect(readLargeText(1)).toBe(true)
    expect(readLargeText(2)).toBe(false)
    writeLargeText(1, false)
    expect(readLargeText(1)).toBe(false)
  })
})
