import { useEffect, useState } from 'react'
import type { Role } from './types'
import { isDriverRole } from './types'

const key = (userId: number) => `farfartaxi-large-text:${userId}`

/** Root font size in px: 16 normally, 20 for drivers (grandparents), +4 more with "Stor text". */
export function rootFontPx(role: Role, large: boolean): number {
  const base = isDriverRole(role) ? 20 : 16
  return large ? base + 4 : base
}

export function readLargeText(userId: number): boolean {
  try {
    return localStorage.getItem(key(userId)) === '1'
  } catch {
    return false
  }
}

export function writeLargeText(userId: number, on: boolean): void {
  try {
    if (on) localStorage.setItem(key(userId), '1')
    else localStorage.removeItem(key(userId))
  } catch {
    /* ignore */
  }
}

/** Persisted per user; applies the size to <html> (as a percentage so browser font settings still count). */
export function useLargeText(userId: number, role: Role) {
  const [large, setLargeState] = useState(() => readLargeText(userId))
  useEffect(() => {
    document.documentElement.style.fontSize = `${(rootFontPx(role, large) / 16) * 100}%`
    return () => {
      document.documentElement.style.fontSize = ''
    }
  }, [role, large])
  const setLarge = (on: boolean) => {
    setLargeState(on)
    writeLargeText(userId, on)
  }
  return { large, setLarge }
}
