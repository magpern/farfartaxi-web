import { act, fireEvent, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultDraft, type BookingDraft } from '../lib/bookingDraft'
import { BookingDraftContext } from '../shell/BookingDraftContext'
import { calls, json, mockFetch, noContent } from '../test/fetchMock'
import { renderApp } from '../test/render'

type ClickHandler = (e: { latlng: { lat: number; lng: number } }) => void
const leaflet = vi.hoisted(() => ({ click: null as unknown }))

vi.mock('leaflet/dist/leaflet.css', () => ({}))
vi.mock('leaflet', () => {
  const layer = () => ({ addTo: () => layer(), setOpacity() {}, setLatLng() {} })
  const map = {
    setView() { return map },
    on(ev: string, cb: unknown) { if (ev === 'click') leaflet.click = cb },
    once() {}, getCenter: () => ({ lat: 0, lng: 0 }), getZoom: () => 13, panTo() {}, fitBounds() {},
    removeLayer() {}, remove() {}
  }
  const L = { map: () => map, tileLayer: layer, divIcon: () => ({}), marker: layer, polyline: () => ({ addTo: layer, getBounds: () => ({}) }) }
  return { default: L, ...L }
})
vi.mock('../shell/ActiveRide', () => ({ useActiveRide: () => ({ active: null, loaded: true, refresh: async () => {} }) }))

import { BookingPage } from './BookingPage'

let draftNow: BookingDraft
function Wrapper() {
  const [draft, setDraft] = useState<BookingDraft>(defaultDraft)
  draftNow = draft
  return (
    <BookingDraftContext.Provider value={{ draft, setDraft, clearBookingDraft: () => {} }}>
      <BookingPage />
    </BookingDraftContext.Provider>
  )
}

function stubGeolocation(mode: 'ok' | 'denied') {
  vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: {
      getCurrentPosition: (ok: (p: unknown) => void, err: () => void) => {
        if (mode === 'ok') ok({ coords: { latitude: 59.4, longitude: 17.8, accuracy: 20 } })
        else err()
      }
    }
  })
}

const STOP = { name: 'Kallhälls station', area: 'Järfälla', lat: 59.41, lon: 17.81, distanceM: 120, providerPlaceId: 's1' }
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(20) })
const tap = async (lat: number, lng: number) => {
  act(() => (leaflet.click as ClickHandler)({ latlng: { lat, lng } }))
  await flush()
}

beforeEach(() => {
  localStorage.setItem('farfartaxi-locale', 'sv')
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('BookingPage places', () => {
  it('GPS: pickup defaults to "Min position" with a nearest-stop hint, one tap uses the stop', async () => {
    stubGeolocation('ok')
    mockFetch((u) => (u.pathname === '/api/places/nearest-stop' ? json(STOP) : undefined))
    renderApp(<Wrapper />)
    await flush()
    expect(screen.getByLabelText('Startadress')).toHaveValue('📍 Min position')
    expect(draftNow.fromLat).toBe(59.4)
    expect(screen.getByText('📍 Här (Kallhälls station, 120 m)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Använd hållplatsen som start' }))
    expect(screen.getByLabelText('Startadress')).toHaveValue('Kallhälls station — Järfälla (hållplats)')
    expect([draftNow.fromLat, draftNow.fromLon]).toEqual([59.41, 17.81])
    expect(screen.queryByText(/Här \(/)).not.toBeInTheDocument()
  })

  it('no stop in range (204): no hint, pickup stays "Min position"', async () => {
    stubGeolocation('ok')
    mockFetch((u) => (u.pathname === '/api/places/nearest-stop' ? noContent() : undefined))
    renderApp(<Wrapper />)
    await flush()
    expect(screen.getByLabelText('Startadress')).toHaveValue('📍 Min position')
    expect(screen.queryByText(/Här \(/)).not.toBeInTheDocument()
  })

  it('GPS denied: no default pickup, no nearest-stop call, search still works without GPS context', async () => {
    stubGeolocation('denied')
    const f = mockFetch((u) => (u.pathname === '/api/places/search' ? json({ results: [], hasMore: false, context: 'DEFAULT' }) : undefined))
    renderApp(<Wrapper />)
    await flush()
    expect(screen.getByLabelText('Startadress')).toHaveValue('')
    expect(calls(f, '/api/places/nearest-stop')).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'kista' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(210) })
    const p = calls(f, '/api/places/search')[0].searchParams
    expect(p.get('lat')).toBeNull()
    expect(screen.getByText('Inga träffar.')).toBeInTheDocument()
  })

  it('selecting a destination fills address + coordinates; ✕ resets the coordinates too', async () => {
    stubGeolocation('denied')
    mockFetch(
      (u) => (u.pathname === '/api/places/search'
        ? json({ results: [{ provider: 'SL', providerPlaceId: 'k', kind: 'POI', name: 'Kista Galleria', area: 'Kista', formattedAddress: 'Kista Galleria, Kista', lat: 59.5, lon: 18.0, distanceKm: 3 }], hasMore: false, context: 'DEFAULT' })
        : undefined),
      (u) => (u.pathname === '/api/places/selections' ? noContent() : undefined)
    )
    renderApp(<Wrapper />)
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'kista' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(210) })
    fireEvent.click(screen.getByRole('option'))
    expect([draftNow.toAddress, draftNow.toLat, draftNow.toLon]).toEqual(['Kista Galleria, Kista', 59.5, 18.0])
    fireEvent.click(screen.getByRole('button', { name: 'Rensa destination' }))
    expect([draftNow.toAddress, draftNow.toLat, draftNow.toLon]).toEqual(['', defaultDraft.toLat, defaultDraft.toLon])
  })

  it('map tap reverse-geocodes via /api/places/reverse and uses the formatted address', async () => {
    stubGeolocation('denied')
    const f = mockFetch((u) =>
      u.pathname === '/api/places/reverse'
        ? json({ provider: 'NOMINATIM', providerPlaceId: null, kind: 'ADDRESS', name: 'Sveavägen 12', area: 'Stockholm', formattedAddress: 'Sveavägen 12, Stockholm', lat: 59.33, lon: 18.06, distanceKm: null })
        : undefined
    )
    renderApp(<Wrapper />)
    await tap(59.33, 18.06)
    expect(calls(f, '/api/places/reverse')[0].searchParams.get('lat')).toBe('59.33')
    expect([draftNow.fromAddress, draftNow.fromLat]).toEqual(['Sveavägen 12, Stockholm', 59.33])
  })

  it.each([
    ['204', () => noContent()],
    ['429', () => json({ error: 'Slow down' }, 429)]
  ])('map tap reverse %s: keeps the coordinates and labels them "Vald plats"', async (_n, res) => {
    stubGeolocation('denied')
    mockFetch((u) => (u.pathname === '/api/places/reverse' ? res() : undefined))
    renderApp(<Wrapper />)
    await tap(59.31, 18.01)
    expect([draftNow.fromAddress, draftNow.fromLat, draftNow.fromLon]).toEqual(['Vald plats', 59.31, 18.01])
  })
})
