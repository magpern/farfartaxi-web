import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { RideResponse } from './rideTypes'

export type RideMessage = {
  id: number
  senderId: number
  code: string
  text?: string | null
  createdAt: string
}

export type ShownMessage = RideMessage & { mine: boolean; highlight: boolean }

export const MESSAGE_STATUSES: readonly string[] = ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'PICKED_UP']
const HIGHLIGHT_MS = 10 * 60 * 1000

/** Latest `limit` messages, newest first; the newest message from the other party in the last 10 min is highlighted. */
export function selectMessages(
  messages: RideMessage[],
  isMine: (m: RideMessage) => boolean,
  now: number,
  limit = 3
): ShownMessage[] {
  const sorted = [...messages].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const newestOther = sorted.find((m) => !isMine(m))
  return sorted.slice(0, limit).map((m) => ({
    ...m,
    mine: isMine(m),
    highlight: m === newestOther && now - Date.parse(m.createdAt) <= HIGHLIGHT_MS
  }))
}

/** Fetches the ride's messages on mount and whenever the (polled) ride object is replaced. Errors are silent. */
export function useRideMessages(ride: RideResponse, token: string): RideMessage[] {
  const [messages, setMessages] = useState<RideMessage[]>([])
  const active = MESSAGE_STATUSES.includes(ride.status)
  useEffect(() => {
    if (!active) return
    let cancelled = false
    api<RideMessage[]>(`/api/rides/${ride.id}/messages`, { token })
      .then((m) => {
        if (!cancelled && Array.isArray(m)) setMessages(m)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [ride, active, token])
  return active ? messages : []
}
