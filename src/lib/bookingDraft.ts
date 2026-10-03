export type BookingDraft = {
  fromAddress: string
  fromLat: number
  fromLon: number
  toAddress: string
  toLat: number
  toLon: number
  /** When set, a driver books the ride for this registered passenger. */
  passengerUserId?: number
  /** Optional "Meddelande till föraren" (max 280 chars). */
  pickupNote?: string
}

export const defaultDraft: BookingDraft = {
  fromAddress: '',
  toAddress: '',
  fromLat: 59.3293,
  fromLon: 18.0686,
  toLat: 59.3346,
  toLon: 18.0632
}

export const BOOKING_DRAFT_STORAGE_KEY = 'farfartaxi-booking-draft'

export function readBookingDraftFromStorage(): BookingDraft | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(BOOKING_DRAFT_STORAGE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Record<string, unknown>
    if (typeof o.fromAddress !== 'string' || typeof o.toAddress !== 'string') return null
    const fromLat = Number(o.fromLat)
    const fromLon = Number(o.fromLon)
    const toLat = Number(o.toLat)
    const toLon = Number(o.toLon)
    if (![fromLat, fromLon, toLat, toLon].every(Number.isFinite)) return null
    const out: BookingDraft = {
      fromAddress: o.fromAddress,
      toAddress: o.toAddress,
      fromLat,
      fromLon,
      toLat,
      toLon
    }
    if (o.passengerUserId != null) {
      const pid = Number(o.passengerUserId)
      if (Number.isFinite(pid)) out.passengerUserId = pid
    }
    if (typeof o.pickupNote === 'string') out.pickupNote = o.pickupNote.slice(0, 280)
    return out
  } catch {
    return null
  }
}

export function writeBookingDraftToStorage(d: BookingDraft) {
  try {
    sessionStorage.setItem(BOOKING_DRAFT_STORAGE_KEY, JSON.stringify(d))
  } catch {
    /* quota / private mode */
  }
}

/** NOW rides omit scheduledAt (the server uses its own clock); SCHEDULED rides require it. */
export function buildRideBookPayload(
  draft: BookingDraft,
  kind: 'NOW' | 'SCHEDULED',
  scheduledAtIso?: string
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    kind,
    fromAddress: draft.fromAddress,
    fromLat: draft.fromLat,
    fromLon: draft.fromLon,
    toAddress: draft.toAddress,
    toLat: draft.toLat,
    toLon: draft.toLon
  }
  if (kind === 'SCHEDULED' && scheduledAtIso) body.scheduledAt = scheduledAtIso
  if (typeof draft.passengerUserId === 'number' && Number.isFinite(draft.passengerUserId)) {
    body.passengerUserId = draft.passengerUserId
  }
  const note = draft.pickupNote?.trim()
  if (note) body.pickupNote = note.slice(0, 280)
  return body
}

/** True when the user has typed anything into the booking flow (used by the update guard). */
export function draftInProgress(d: BookingDraft): boolean {
  return (
    d.fromAddress.trim() !== '' ||
    d.toAddress.trim() !== '' ||
    (d.pickupNote ?? '').trim() !== '' ||
    d.passengerUserId != null
  )
}
