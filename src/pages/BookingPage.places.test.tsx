import { act, fireEvent, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultDraft, type BookingDraft } from '../lib/bookingDraft'
import { BookingDraftContext } from '../shell/BookingDraftContext'
import { calls, json, mockFetch, noContent } from '../test/fetchMock'
import { renderApp } from '../test/render'
import { useI18n } from '../i18n/context'

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
function LangSwitch() {
  const { setLocale } = useI18n()
  return <button type="button" onClick={() => setLocale('en')}>to-en</button>
}
function Wrapper() {
  const [draft, setDraft] = useState<BookingDraft>(defaultDraft)
  draftNow = draft
  return (
    <BookingDraftContext.Provider value={{ draft, setDraft, clearBookingDraft: () => {} }}>
      <LangSwitch />
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
  ])('map tap reverse %s and no stop nearby: labels with the coordinates, never bare "Vald plats"', async (_n, res) => {
    stubGeolocation('denied')
    mockFetch(
      (u) => (u.pathname === '/api/places/reverse' ? res() : undefined),
      (u) => (u.pathname === '/api/places/nearest-stop' ? noContent() : undefined)
    )
    renderApp(<Wrapper />)
    await tap(59.4, 17.8)
    expect([draftNow.fromAddress, draftNow.fromLat, draftNow.fromLon]).toEqual(['Vald plats (59.40000, 17.80000)', 59.4, 17.8])
  })

  it('map tap reverse 204 with a stop nearby: "Nära <stop>"', async () => {
    stubGeolocation('denied')
    const f = mockFetch(
      (u) => (u.pathname === '/api/places/reverse' ? noContent() : undefined),
      (u) => (u.pathname === '/api/places/nearest-stop' ? json(STOP) : undefined)
    )
    renderApp(<Wrapper />)
    await tap(59.31, 18.01)
    expect(calls(f, '/api/places/nearest-stop')[0].searchParams.get('lat')).toBe('59.31')
    expect(draftNow.fromAddress).toBe('Nära Kallhälls station')
  })

  it('stop without area: "<name> (hållplats)"', async () => {
    stubGeolocation('ok')
    mockFetch((u) => (u.pathname === '/api/places/nearest-stop' ? json({ ...STOP, area: null }) : undefined))
    renderApp(<Wrapper />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Använd hållplatsen som start' }))
    expect(screen.getByLabelText('Startadress')).toHaveValue('Kallhälls station (hållplats)')
  })

  it('inaccurate GPS fix (>= 1000 m): no default pickup and no nearest-stop hint', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 59.4, longitude: 17.8, accuracy: 1000 } }) }
    })
    const f = mockFetch((u) => (u.pathname === '/api/places/nearest-stop' ? json(STOP) : undefined))
    renderApp(<Wrapper />)
    await flush()
    expect(screen.getByLabelText('Startadress')).toHaveValue('')
    expect(calls(f, '/api/places/nearest-stop')).toHaveLength(0)
    expect(screen.queryByText(/Här \(/)).not.toBeInTheDocument()
  })

  it('pickup and destination inputs are capped at 100 characters', () => {
    stubGeolocation('denied')
    renderApp(<Wrapper />)
    expect(screen.getByLabelText('Startadress')).toHaveAttribute('maxlength', '100')
    expect(screen.getByLabelText('Destination')).toHaveAttribute('maxlength', '100')
  })

  it('"Min position" is language independent: the flag, not the text, is resolved', async () => {
    stubGeolocation('ok')
    const f = mockFetch(
      (u) => (u.pathname === '/api/places/nearest-stop' ? noContent() : undefined),
      (u) => (u.pathname === '/api/places/reverse' ? json({ provider: 'NOMINATIM', providerPlaceId: null, kind: 'ADDRESS', name: 'x', area: null, formattedAddress: 'Sveavägen 12, Stockholm', lat: 59.4, lon: 17.8, distanceKm: null }) : undefined),
      (u, init) => (u.pathname === '/api/rides' && init?.method === 'POST' ? json({ id: 5, passengerId: 1 }) : undefined)
    )
    renderApp(<Wrapper />)
    await flush()
    expect(draftNow.fromIsGps).toBe(true)
    // switch language after the default was set: the stored text is Swedish, the UI is English
    fireEvent.click(screen.getByRole('button', { name: 'to-en' }))
    expect(screen.getByLabelText('Pickup address')).toHaveValue('📍 My position')
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'School' } })
    fireEvent.click(screen.getByRole('button', { name: 'Go now' }))
    await flush()
    fireEvent.click(screen.getByRole('button', { name: /^Yes/ }))
    await flush()
    const post = f.mock.calls.find((c) => String(c[0]).includes('/api/rides') && c[1]?.method === 'POST')
    const from = JSON.parse(String(post?.[1]?.body)).fromAddress
    expect(from).toBe('Sveavägen 12, Stockholm')
  })

  it('a hand-typed "Min position" without a GPS fix is blocked, nothing is sent', async () => {
    stubGeolocation('denied')
    const f = mockFetch()
    renderApp(<Wrapper />)
    fireEvent.change(screen.getByLabelText('Startadress'), { target: { value: '📍 Min position' } })
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'Skolan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Åka nu' }))
    await flush()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(calls(f, '/api/rides')).toHaveLength(0)
  })

  it('buttons show "Hämtar adress…" and are disabled while the pickup label is resolved', async () => {
    stubGeolocation('ok')
    let release: (r: Response) => void = () => {}
    mockFetch(
      (u) => (u.pathname === '/api/places/nearest-stop' ? noContent() : undefined),
      (u) => (u.pathname === '/api/places/reverse' ? new Promise<Response>((r) => { release = r }) as unknown as Response : undefined)
    )
    renderApp(<Wrapper />)
    await flush()
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'Skolan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Åka nu' }))
    await flush()
    const busy = screen.getAllByRole('button', { name: 'Hämtar adress…' })
    expect(busy).toHaveLength(2)
    busy.forEach((b) => expect(b).toBeDisabled())
    await act(async () => { release(noContent()); await vi.advanceTimersByTimeAsync(20) })
    expect(screen.queryByRole('button', { name: 'Hämtar adress…' })).not.toBeInTheDocument()
  })

  describe('"Min position" is resolved before booking', () => {
    async function bookWith(reverse: () => Response, stop: Response) {
      stubGeolocation('ok')
      const f = mockFetch(
        (u) => (u.pathname === '/api/places/nearest-stop' ? stop : undefined),
        (u) => (u.pathname === '/api/places/reverse' ? reverse() : undefined),
        (u, init) => (u.pathname === '/api/rides' && init?.method === 'POST' ? json({ id: 5, passengerId: 1 }) : undefined)
      )
      renderApp(<Wrapper />)
      await flush()
      expect(screen.getByLabelText('Startadress')).toHaveValue('📍 Min position')
      fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'Skolan' } })
      fireEvent.click(screen.getByRole('button', { name: 'Åka nu' }))
      await flush()
      return f
    }
    const sheetPickup = () => screen.getByRole('dialog').textContent ?? ''
    const postedFrom = (f: ReturnType<typeof mockFetch>) => {
      const post = f.mock.calls.find((c) => String(c[0]).includes('/api/rides') && c[1]?.method === 'POST')
      return JSON.parse(String(post?.[1]?.body)).fromAddress
    }

    it('1. reverse geocode label', async () => {
      const f = await bookWith(
        () => json({ provider: 'NOMINATIM', providerPlaceId: null, kind: 'ADDRESS', name: 'Sveavägen 12', area: 'Stockholm', formattedAddress: 'Sveavägen 12, Stockholm', lat: 59.4, lon: 17.8, distanceKm: null }),
        json(STOP)
      )
      expect(sheetPickup()).toContain('Sveavägen 12, Stockholm')
      expect(sheetPickup()).not.toContain('Min position')
      fireEvent.click(screen.getByRole('button', { name: /^Ja/ }))
      await flush()
      expect(postedFrom(f)).toBe('Sveavägen 12, Stockholm')
    })

    it('2. reverse fails (429): "Nära <stop>"', async () => {
      const f = await bookWith(() => json({ error: 'slow' }, 429), json(STOP))
      expect(sheetPickup()).toContain('Nära Kallhälls station')
      fireEvent.click(screen.getByRole('button', { name: /^Ja/ }))
      await flush()
      expect(postedFrom(f)).toBe('Nära Kallhälls station')
    })

    it('3. reverse 204 and no stop: "Min position (GPS)" with 5-decimal coordinates', async () => {
      const f = await bookWith(() => noContent(), noContent())
      expect(sheetPickup()).toContain('Min position (GPS) 59.40000, 17.80000')
      fireEvent.click(screen.getByRole('button', { name: /^Ja/ }))
      await flush()
      expect(postedFrom(f)).toBe('Min position (GPS) 59.40000, 17.80000')
    })
  })
})
