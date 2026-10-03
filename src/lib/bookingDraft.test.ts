import { beforeEach, describe, expect, it } from 'vitest'
import {
  BOOKING_DRAFT_STORAGE_KEY,
  buildRideBookPayload,
  defaultDraft,
  readBookingDraftFromStorage,
  writeBookingDraftToStorage
} from './bookingDraft'

describe('buildRideBookPayload', () => {
  it('maps the draft and scheduledAt, omitting passengerUserId when unset', () => {
    const body = buildRideBookPayload(defaultDraft, 'SCHEDULED', '2026-01-01T10:00:00Z')
    expect(body).toEqual({
      kind: 'SCHEDULED',
      fromAddress: '',
      fromLat: defaultDraft.fromLat,
      fromLon: defaultDraft.fromLon,
      toAddress: '',
      toLat: defaultDraft.toLat,
      toLon: defaultDraft.toLon,
      scheduledAt: '2026-01-01T10:00:00Z'
    })
  })
  it('includes a finite numeric passengerUserId', () => {
    expect(buildRideBookPayload({ ...defaultDraft, passengerUserId: 7 }, 'NOW', 'x').passengerUserId).toBe(7)
    expect(buildRideBookPayload({ ...defaultDraft, passengerUserId: NaN }, 'NOW', 'x')).not.toHaveProperty('passengerUserId')
  })
  it('sends kind and a trimmed pickupNote only when present', () => {
    expect(buildRideBookPayload(defaultDraft, 'NOW', 'x').kind).toBe('NOW')
    expect(buildRideBookPayload(defaultDraft, 'NOW', 'x')).not.toHaveProperty('pickupNote')
    expect(buildRideBookPayload({ ...defaultDraft, pickupNote: '  Blå dörr ' }, 'NOW', 'x').pickupNote).toBe('Blå dörr')
    expect(buildRideBookPayload({ ...defaultDraft, pickupNote: ' ' }, 'NOW', 'x')).not.toHaveProperty('pickupNote')
  })
})

describe('booking draft storage', () => {
  beforeEach(() => sessionStorage.clear())

  it('returns null when nothing is stored', () => {
    expect(readBookingDraftFromStorage()).toBeNull()
  })
  it('round-trips a draft', () => {
    const d = { ...defaultDraft, fromAddress: 'A', toAddress: 'B', passengerUserId: 3 }
    writeBookingDraftToStorage(d)
    expect(readBookingDraftFromStorage()).toEqual(d)
  })
  it('round-trips the pickup note', () => {
    const d = { ...defaultDraft, fromAddress: 'A', toAddress: 'B', pickupNote: 'Vid grinden' }
    writeBookingDraftToStorage(d)
    expect(readBookingDraftFromStorage()?.pickupNote).toBe('Vid grinden')
  })
  it('rejects invalid JSON and invalid shapes', () => {
    sessionStorage.setItem(BOOKING_DRAFT_STORAGE_KEY, '{nope')
    expect(readBookingDraftFromStorage()).toBeNull()
    sessionStorage.setItem(BOOKING_DRAFT_STORAGE_KEY, JSON.stringify({ fromAddress: 'a', toAddress: 'b', fromLat: 'x' }))
    expect(readBookingDraftFromStorage()).toBeNull()
    sessionStorage.setItem(BOOKING_DRAFT_STORAGE_KEY, JSON.stringify({ fromLat: 1, fromLon: 1, toLat: 1, toLon: 1 }))
    expect(readBookingDraftFromStorage()).toBeNull()
  })
})
