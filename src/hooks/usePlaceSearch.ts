import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_LIMIT,
  MORE_LIMIT,
  searchPlaces,
  type PlaceResult,
  type SearchContext
} from '../api/places'

export const MIN_QUERY_CHARS = 2
export const SEARCH_DEBOUNCE_MS = 200

export type PlaceSearchStatus = 'idle' | 'loading' | 'ready' | 'error'

export function normalizeQuery(q: string): string {
  return q.normalize('NFC').trim()
}

type Options = {
  token: string
  query: string
  /** When false nothing is fetched and results are cleared. */
  enabled?: boolean
  context?: SearchContext
}

/**
 * Debounced place search: 200 ms after typing stops, from 2 characters, the previous request is aborted so a
 * stale response can never overwrite a newer one. `showMore` re-queries with limit 25.
 */
export function usePlaceSearch({ token, query, enabled = true, context }: Options) {
  const q = normalizeQuery(query)
  const active = enabled && q.length >= MIN_QUERY_CHARS
  const [expandedFor, setExpandedFor] = useState<string | null>(null)
  const expanded = expandedFor === q
  const [state, setState] = useState<{ status: PlaceSearchStatus; results: PlaceResult[]; hasMore: boolean }>({
    status: 'idle',
    results: [],
    hasMore: false
  })

  const gpsLat = context?.gps?.lat
  const gpsLon = context?.gps?.lon
  const gpsAcc = context?.gps?.accuracy
  const pLat = context?.pickup?.lat
  const pLon = context?.pickup?.lon

  useEffect(() => {
    if (!active) {
      setState((s) => (s.status === 'idle' && s.results.length === 0 ? s : { status: 'idle', results: [], hasMore: false }))
      return
    }
    const ctrl = new AbortController()
    const ctx: SearchContext = {
      gps: gpsLat != null && gpsLon != null ? { lat: gpsLat, lon: gpsLon, accuracy: gpsAcc } : null,
      pickup: pLat != null && pLon != null ? { lat: pLat, lon: pLon } : null
    }
    const id = setTimeout(() => {
      setState((s) => ({ ...s, status: 'loading' }))
      searchPlaces(token, q, ctx, expanded ? MORE_LIMIT : DEFAULT_LIMIT, ctrl.signal)
        .then((r) => {
          if (ctrl.signal.aborted) return
          setState({ status: 'ready', results: r.results ?? [], hasMore: !!r.hasMore })
        })
        .catch(() => {
          if (ctrl.signal.aborted) return
          setState({ status: 'error', results: [], hasMore: false })
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(id)
      ctrl.abort()
    }
  }, [active, q, expanded, token, gpsLat, gpsLon, gpsAcc, pLat, pLon])

  const showMore = useCallback(() => setExpandedFor(q), [q])

  return { ...state, active, showMore, expanded }
}
