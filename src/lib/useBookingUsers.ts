import { useEffect, useState } from 'react'
import { api } from '../api/client'

export type BookingUserOption = { id: number; fullName: string; email: string }

/** Registered users a driver may book for; null while loading (or when disabled). */
export function useBookingUsers(token: string, enabled: boolean): BookingUserOption[] | null {
  const [users, setUsers] = useState<BookingUserOption[] | null>(null)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setUsers(null)
    void (async () => {
      try {
        const list = await api<BookingUserOption[]>('/api/users/for-booking', { token })
        if (!cancelled) setUsers(Array.isArray(list) ? list : [])
      } catch {
        if (!cancelled) setUsers([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enabled, token])
  return users
}
