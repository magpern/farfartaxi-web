import { api } from './client'
import type { PlaceResult } from './places'

export type SavedPlaceKind = 'HOME' | 'SCHOOL' | 'SPORTS' | 'WORK' | 'FAMILY' | 'OTHER'

export const SAVED_KINDS: SavedPlaceKind[] = ['HOME', 'SCHOOL', 'SPORTS', 'WORK', 'FAMILY', 'OTHER']

export const SAVED_KIND_ICON: Record<SavedPlaceKind, string> = {
  HOME: '🏠',
  SCHOOL: '🏫',
  SPORTS: '⚽',
  WORK: '💼',
  FAMILY: '👵',
  OTHER: '⭐'
}

export type SavedPlace = {
  id: number
  label: string
  address: string
  formattedAddress: string | null
  lat: number
  lon: number
  sortOrder: number
  kind: SavedPlaceKind
  icon: string | null
  provider: string | null
  providerPlaceId: string | null
}

export type SavedPlaceInput = {
  label: string
  address: string
  formattedAddress?: string
  lat: number
  lon: number
  kind?: SavedPlaceKind
  icon?: string
  provider?: string | null
  providerPlaceId?: string | null
}

const q = (userId?: number) => (userId != null ? `?userId=${userId}` : '')

export const listSavedPlaces = (token: string, userId?: number) =>
  api<SavedPlace[]>(`/api/saved-places${q(userId)}`, { token })

export const createSavedPlace = (token: string, input: SavedPlaceInput, userId?: number) =>
  api<SavedPlace>(`/api/saved-places${q(userId)}`, { method: 'POST', token, body: JSON.stringify(input) })

export const updateSavedPlace = (token: string, id: number, patch: Partial<Pick<SavedPlaceInput, 'label' | 'kind' | 'icon'>>) =>
  api<SavedPlace>(`/api/saved-places/${id}`, { method: 'PATCH', token, body: JSON.stringify(patch) })

export const deleteSavedPlace = (token: string, id: number) => api(`/api/saved-places/${id}`, { method: 'DELETE', token })

export const reorderSavedPlaces = (token: string, ids: number[], userId?: number) =>
  api(`/api/saved-places/order${q(userId)}`, { method: 'PUT', token, body: JSON.stringify({ ids }) })

export const recentPlaces = (token: string, limit = 6, userId?: number) =>
  api<PlaceResult[]>(`/api/places/recent?limit=${limit}${userId != null ? `&userId=${userId}` : ''}`, { token })

export const MAX_PLACE_NAME = 60

/** Default saved-place name from an address: the part before the first comma ("Sveavägen 12, Stockholm" -> "Sveavägen 12"), max 60 chars. */
export function placeNameFromAddress(address: string): string {
  return address.split(',')[0].trim().slice(0, MAX_PLACE_NAME)
}

/** Draft of a place to save: from a search result or a finished ride. */
export type PlaceDraft = {
  name: string
  address: string
  lat: number
  lon: number
  provider?: string | null
  providerPlaceId?: string | null
  kind?: SavedPlaceKind
}

export function draftFromResult(p: PlaceResult): PlaceDraft {
  return {
    name: p.name,
    address: p.formattedAddress || p.name,
    lat: p.lat,
    lon: p.lon,
    provider: p.provider === 'FAVORITE' || p.provider === 'RECENT' ? null : p.provider,
    providerPlaceId: p.providerPlaceId
  }
}
