import { describe, expect, it } from 'vitest'
import { formatDateTime, formatHm, formatYmdHm, stockholmLocalToInstant, stockholmParts } from './time'

describe('stockholmLocalToInstant', () => {
  it('converts a normal winter time (UTC+1)', () => {
    expect(stockholmLocalToInstant(2026, 1, 15, 12, 0)).toEqual({
      ok: true,
      iso: '2026-01-15T11:00:00.000Z',
      ambiguous: false
    })
  })

  it('converts a normal summer time (UTC+2)', () => {
    expect(stockholmLocalToInstant(2026, 7, 1, 12, 0)).toEqual({
      ok: true,
      iso: '2026-07-01T10:00:00.000Z',
      ambiguous: false
    })
  })

  it('rejects a non-existent time on 2027-03-28 (spring forward)', () => {
    expect(stockholmLocalToInstant(2027, 3, 28, 2, 30)).toEqual({ ok: false, reason: 'nonexistent' })
    expect(stockholmLocalToInstant(2027, 3, 28, 2, 0)).toEqual({ ok: false, reason: 'nonexistent' })
  })

  it('accepts times either side of the 2027-03-28 gap', () => {
    expect(stockholmLocalToInstant(2027, 3, 28, 1, 59)).toMatchObject({ ok: true, ambiguous: false })
    expect(stockholmLocalToInstant(2027, 3, 28, 3, 0)).toEqual({
      ok: true,
      iso: '2027-03-28T01:00:00.000Z',
      ambiguous: false
    })
  })

  it('picks the first occurrence of an ambiguous time on 2026-10-25 and flags it', () => {
    // 02:30 happens at 00:30Z (CEST, +2) and again at 01:30Z (CET, +1).
    expect(stockholmLocalToInstant(2026, 10, 25, 2, 30)).toEqual({
      ok: true,
      iso: '2026-10-25T00:30:00.000Z',
      ambiguous: true
    })
  })

  it('does not flag times outside the 2026-10-25 overlap', () => {
    expect(stockholmLocalToInstant(2026, 10, 25, 1, 59)).toMatchObject({ ok: true, ambiguous: false })
    expect(stockholmLocalToInstant(2026, 10, 25, 3, 0)).toEqual({
      ok: true,
      iso: '2026-10-25T02:00:00.000Z',
      ambiguous: false
    })
  })
})

describe('formatting', () => {
  it('renders in Stockholm time regardless of the runtime zone', () => {
    expect(formatHm('2026-10-25T00:30:00Z')).toBe('02:30')
    expect(formatHm('2026-10-25T01:30:00Z')).toBe('02:30')
    expect(formatYmdHm('2026-07-01T10:00:00Z')).toBe('2026-07-01 12:00')
    expect(stockholmParts(new Date('2027-03-28T01:00:00Z')).hour).toBe(3)
  })

  it('formats locale date-times with 24h clock', () => {
    expect(formatDateTime('2026-01-15T11:00:00Z', 'sv-SE')).toContain('12:00')
  })
})
