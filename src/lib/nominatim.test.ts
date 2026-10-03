import { describe, expect, it } from 'vitest'
import { dedupeNominatimResults, formatNominatimAddress, type NominatimResult } from './nominatim'

const base = { lat: '0', lon: '0' }

describe('formatNominatimAddress', () => {
  it('formats street + number + municipality without kommun suffix', () => {
    expect(
      formatNominatimAddress({
        display_name: 'x',
        address: { road: 'Storvägen', house_number: '10', municipality: 'Järfälla kommun' }
      })
    ).toBe('Storvägen 10, Järfälla')
  })
  it('prefixes POI name unless it overlaps the street', () => {
    const r: NominatimResult = {
      ...base,
      display_name: 'x',
      name: 'ICA Maxi',
      address: { road: 'Barkarbyvägen', city: 'Järfälla' }
    }
    expect(formatNominatimAddress(r)).toBe('ICA Maxi, Barkarbyvägen, Järfälla')
    expect(formatNominatimAddress({ ...r, name: 'Barkarbyvägen' })).toBe('Barkarbyvägen, Järfälla')
  })
  it('falls back to county, then display_name', () => {
    expect(formatNominatimAddress({ display_name: 'x', address: { county: 'Uppsala län' } })).toBe('Uppsala')
    expect(formatNominatimAddress({ display_name: 'Fallback' })).toBe('Fallback')
    expect(formatNominatimAddress({})).toBe('')
  })
})

describe('dedupeNominatimResults', () => {
  it('drops entries with the same formatted label (case/whitespace-insensitive)', () => {
    const a: NominatimResult = { ...base, display_name: 'a', address: { road: 'Storvägen', city: 'Solna' } }
    const b: NominatimResult = { ...base, display_name: 'b', address: { road: 'storvägen', city: 'Solna' } }
    const c: NominatimResult = { ...base, display_name: 'c', address: { road: 'Lillvägen', city: 'Solna' } }
    expect(dedupeNominatimResults([a, b, c])).toEqual([a, c])
  })
})
