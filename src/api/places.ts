import { api } from './client'

export type PlaceKind = 'STOP' | 'ADDRESS' | 'POI' | 'FAVORITE' | 'RECENT'
export type PlaceProvider = 'SL' | 'NOMINATIM' | 'FAVORITE' | 'RECENT'

export type PlaceResult = {
  provider: PlaceProvider
  providerPlaceId: string | null
  kind: PlaceKind
  name: string
  area: string | null
  formattedAddress: string
  lat: number
  lon: number
  distanceKm: number | null
}

export type SearchContextKind = 'GPS' | 'PICKUP' | 'HOME' | 'DEFAULT'

export type PlaceSearchResponse = {
  results: PlaceResult[]
  hasMore: boolean
  context: SearchContextKind
}

export type NearestStop = {
  name: string
  area: string | null
  lat: number
  lon: number
  distanceM: number
  providerPlaceId: string | null
}

/** Where the user is / is going from; the backend picks the best context point. */
export type SearchContext = {
  gps?: { lat: number; lon: number; accuracy?: number } | null
  pickup?: { lat: number; lon: number } | null
}

export const DEFAULT_LIMIT = 8
export const MORE_LIMIT = 25

export function searchPlaces(
  token: string,
  q: string,
  ctx: SearchContext,
  limit: number,
  signal?: AbortSignal
): Promise<PlaceSearchResponse> {
  const p = new URLSearchParams({ q, limit: String(limit) })
  if (ctx.gps) {
    p.set('lat', String(ctx.gps.lat))
    p.set('lon', String(ctx.gps.lon))
    if (ctx.gps.accuracy != null) p.set('accuracy', String(Math.round(ctx.gps.accuracy)))
  }
  if (ctx.pickup) {
    p.set('pickupLat', String(ctx.pickup.lat))
    p.set('pickupLon', String(ctx.pickup.lon))
  }
  return api<PlaceSearchResponse>(`/api/places/search?${p}`, { token, signal })
}

/** Resolves to null when no stop is within range (204). */
export async function nearestStop(token: string, lat: number, lon: number, signal?: AbortSignal): Promise<NearestStop | null> {
  const r = await api<NearestStop | undefined>(`/api/places/nearest-stop?lat=${lat}&lon=${lon}`, { token, signal })
  return r ?? null
}

/** Fire-and-forget: errors are swallowed. */
export function recordSelection(token: string, query: string, place: PlaceResult): void {
  void api('/api/places/selections', {
    method: 'POST',
    token,
    body: JSON.stringify({
      query,
      provider: place.provider,
      providerPlaceId: place.providerPlaceId,
      name: place.name,
      lat: place.lat,
      lon: place.lon
    })
  }).catch(() => {})
}

/** Resolves to null on 204 (nothing found); rejects with ApiError(429) when rate limited. */
export async function reversePlace(token: string, lat: number, lon: number, signal?: AbortSignal): Promise<PlaceResult | null> {
  const r = await api<PlaceResult | undefined>(`/api/places/reverse?lat=${lat}&lon=${lon}`, { token, signal })
  return r ?? null
}
