import { describe, expect, it } from 'vitest'
import { haversine } from './geo'

describe('haversine', () => {
  it('is zero for identical points', () => {
    expect(haversine(59.33, 18.07, 59.33, 18.07)).toBe(0)
  })
  it('computes Stockholm -> Gothenburg roughly 400 km', () => {
    const d = haversine(59.3293, 18.0686, 57.7089, 11.9746)
    expect(d).toBeGreaterThan(390)
    expect(d).toBeLessThan(410)
  })
  it('is symmetric', () => {
    expect(haversine(59, 18, 58, 17)).toBeCloseTo(haversine(58, 17, 59, 18), 10)
  })
})
