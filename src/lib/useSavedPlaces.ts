import { useCallback, useEffect, useState } from 'react'
import { listSavedPlaces, recentPlaces, type SavedPlace } from '../api/savedPlaces'
import type { PlaceResult } from '../api/places'

/** Saved places of the user (or of a passenger when `userId` is set). null while loading; [] when it fails. */
export function useSavedPlaces(token: string, userId?: number) {
  const [places, setPlaces] = useState<SavedPlace[] | null>(null)
  const [failed, setFailed] = useState(false)
  const reload = useCallback(async () => {
    try {
      const l = await listSavedPlaces(token, userId)
      setPlaces(Array.isArray(l) ? [...l].sort((a, b) => a.sortOrder - b.sortOrder) : [])
      setFailed(false)
    } catch {
      setPlaces((p) => p ?? [])
      setFailed(true)
    }
  }, [token, userId])
  useEffect(() => {
    setPlaces(null)
    void reload()
  }, [reload])
  return { places, failed, reload, setPlaces }
}

export function useRecentPlaces(token: string): PlaceResult[] {
  const [items, setItems] = useState<PlaceResult[]>([])
  useEffect(() => {
    let off = false
    recentPlaces(token, 6)
      .then((r) => !off && setItems(Array.isArray(r) ? r : []))
      .catch(() => {})
    return () => {
      off = true
    }
  }, [token])
  return items
}
