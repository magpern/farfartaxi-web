import { describe, expect, it } from 'vitest'
import en from '../locales/en.json'
import sv from '../locales/sv.json'
import { ALL_RIDE_STATUSES, rideStatusKey, rideStatusLabel } from './rideStatus'

const catalogs = { sv, en }

describe('rideStatus', () => {
  it('covers all eight statuses', () => {
    expect([...ALL_RIDE_STATUSES].sort()).toEqual(
      ['ACCEPTED', 'ARRIVED', 'CANCELLED', 'COMPLETED', 'EN_ROUTE', 'NO_DRIVER', 'PICKED_UP', 'REQUESTED'].sort()
    )
  })

  for (const [name, cat] of Object.entries(catalogs)) {
    it(`has a friendly ${name} label for every status and perspective`, () => {
      for (const s of ALL_RIDE_STATUSES) {
        for (const group of ['rideStatus', 'rideStatusDriver'] as const) {
          const label = (cat[group] as Record<string, string>)[s]
          expect(label, `${name}.${group}.${s}`).toBeTruthy()
          expect(label).not.toMatch(/^[A-Z_]+$/)
        }
      }
      expect(cat.rideStatus.UNKNOWN).toBeTruthy()
    })
  }

  it('maps statuses to Swedish copy', () => {
    const t = (key: string) => key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], sv) as string
    expect(rideStatusLabel(t, 'REQUESTED')).toBe('Väntar på förare')
    expect(rideStatusLabel(t, 'EN_ROUTE')).toBe('Farfar är på väg')
    expect(rideStatusLabel(t, 'NO_DRIVER')).toBe('Ingen förare har tackat ja än')
  })

  it('falls back for unknown statuses', () => {
    expect(rideStatusKey('PENDING_OPEN')).toBe('rideStatus.UNKNOWN')
  })
})
