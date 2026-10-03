import { useCallback, useEffect, useRef, useState } from 'react'
import { listSavedPlaces, recentPlaces, type SavedPlace } from '../api/savedPlaces'
import type { PlaceResult } from '../api/places'

/** Saved places of the user (or of a passenger when `userId` is set). null while loading; [] when it fails. */
export function useSavedPlaces(token: string, userId?: number) {
  const [places, setPlaces] = useState<SavedPlace[] | null>(null)
  const [failed, setFailed] = useState(false)
  const seq = useRef(0)
  const reload = useCallback(async () => {
    const mine = ++seq.current
    try {
      const l = await listSavedPlaces(token, userId)
      if (mine !== seq.current) return // superseded (another passenger / newer reload)
      setPlaces(Array.isArray(l) ? [...l].sort((a, b) => a.sortOrder - b.sortOrder) : [])
      setFailed(false)
    } catch {
      if (mine !== seq.current) return
      setPlaces((p) => p ?? [])
      setFailed(true)
    }
  }, [token, userId])
  useEffect(() => {
    setPlaces(null)
    setFailed(false)
    void reload() // bumps seq, so any in-flight response for the previous passenger is ignored
  }, [reload])
  return { places, failed, reload, setPlaces }
}

export function useRecentPlaces(token: string, userId?: number): PlaceResult[] {
  const [items, setItems] = useState<PlaceResult[]>([])
  useEffect(() => {
    let off = false
    setItems([])
    recentPlaces(token, 6, userId)
      .then((r) => !off && setItems(Array.isArray(r) ? r : []))
      .catch(() => {})
    return () => {
      off = true
    }
  }, [token, userId])
  return items
}
