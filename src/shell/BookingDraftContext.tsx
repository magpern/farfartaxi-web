import { createContext, useContext, type Dispatch, type SetStateAction } from 'react'
import type { BookingDraft } from '../lib/bookingDraft'

export type BookingDraftValue = {
  draft: BookingDraft
  setDraft: Dispatch<SetStateAction<BookingDraft>>
  clearBookingDraft: () => void
}

export const BookingDraftContext = createContext<BookingDraftValue | null>(null)

export function useBookingDraft(): BookingDraftValue {
  const ctx = useContext(BookingDraftContext)
  if (!ctx) throw new Error('useBookingDraft')
  return ctx
}
