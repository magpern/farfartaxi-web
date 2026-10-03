import { act, fireEvent, screen } from '@testing-library/react'
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultDraft, type BookingDraft } from '../lib/bookingDraft'
import { BookingDraftContext } from '../shell/BookingDraftContext'
import { json, mockFetch, noContent } from '../test/fetchMock'
import { renderApp } from '../test/render'
import { useI18n } from '../i18n/context'

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
function Where() {
  const l = useLocation()
  return (
    <>
      <p>{l.search.replace('?', '')}</p>
      <p data-testid="nav-state">{JSON.stringify(l.state)}</p>
    </>
  )
}
function LangSwitch() {
  const { setLocale } = useI18n()
  return <button type="button" onClick={() => setLocale('en')}>to-en</button>
}
function Wrapper({ initial = defaultDraft }: { initial?: BookingDraft }) {
  const [draft, setDraft] = useState<BookingDraft>(initial)
  draftNow = draft
  return (
    <BookingDraftContext.Provider value={{ draft, setDraft, clearBookingDraft: () => {} }}>
      <LangSwitch />
      <BookingPage />
      <Where />
    </BookingDraftContext.Provider>
  )
}

const geo = { ok: null as null | ((p: unknown) => void), err: null as null | (() => void) }
/** 'late': the fix is delivered later by calling geo.ok / geo.err. */
function stubGeolocation(mode: 'ok' | 'denied' | 'late') {
  vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: {
      getCurrentPosition: (ok: (p: unknown) => void, err: () => void) => {
        if (mode === 'ok') ok({ coords: { latitude: 59.4, longitude: 17.8, accuracy: 20 } })
        else if (mode === 'denied') err()
        else {
          geo.ok = ok
          geo.err = err
        }
      }
    }
  })
}


const HOME = { id: 1, label: 'Hem', address: 'Storgatan 1, Kista', formattedAddress: 'Storgatan 1, Kista', lat: 59.5, lon: 18.0, sortOrder: 0, kind: 'HOME', icon: null, provider: null, providerPlaceId: null }
const SCHOOL = { ...HOME, id: 2, label: 'Skolan', address: 'Skolvägen 3', formattedAddress: 'Skolvägen 3', lat: 59.6, lon: 18.1, sortOrder: 1, kind: 'SCHOOL' }
const REVERSE = { provider: 'NOMINATIM', providerPlaceId: null, kind: 'ADDRESS', name: 'Sveavägen 12', area: 'Stockholm', formattedAddress: 'Sveavägen 12, Stockholm', lat: 59.4, lon: 17.8, distanceKm: null }
const RECENT = { provider: 'RECENT', providerPlaceId: null, kind: 'RECENT', name: 'Bio Rio', area: 'Söder', formattedAddress: 'Bio Rio, Söder', lat: 59.31, lon: 18.05, distanceKm: null }
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(20) })

function backend(saved: unknown[], extra: Array<(u: URL, i?: RequestInit) => Response | undefined> = []) {
  return mockFetch(
    ...extra,
    (u, i) => (u.pathname === '/api/saved-places' && (!i?.method || i.method === 'GET') ? json(saved) : undefined),
    (u) => (u.pathname === '/api/places/recent' ? json([RECENT]) : undefined),
    (u) => (u.pathname === '/api/places/nearest-stop' ? noContent() : undefined),
    (u) => (u.pathname === '/api/places/reverse' ? json(REVERSE) : undefined),
    (u, i) => (u.pathname === '/api/rides' && i?.method === 'POST' ? json({ id: 5, passengerId: 1 }) : undefined)
  )
}

beforeEach(() => {
  localStorage.setItem('farfartaxi-locale', 'sv')
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Home screen "Vart ska du?"', () => {
  it('Åk hem books in exactly 3 taps from a cold start (GPS granted)', async () => {
    stubGeolocation('ok')
    const f = backend([HOME, SCHOOL])
    renderApp(<Wrapper />)
    await flush()
    let taps = 0
    const tapBtn = async (name: string | RegExp) => {
      fireEvent.click(screen.getByRole('button', { name }))
      taps++
      await flush()
    }
    await tapBtn(/Åk hem/)
    await tapBtn('Nu')
    await tapBtn('Ja, boka nu')
    expect(taps).toBe(3)
    const post = f.mock.calls.find((c) => String(c[0]).includes('/api/rides') && c[1]?.method === 'POST')
    const body = JSON.parse(String(post?.[1]?.body))
    expect(body).toMatchObject({ kind: 'NOW', toAddress: 'Storgatan 1, Kista', toLat: 59.5, toLon: 18.0, fromAddress: 'Sveavägen 12, Stockholm', fromLat: 59.4, fromLon: 17.8 })
    expect(body.fromAddress).not.toMatch(/Min position/)
  })

  it('slow GPS: Åk hem opens the sheet waiting for the fix, Nu is enabled when it arrives, still 3 taps', async () => {
    stubGeolocation('late')
    const f = backend([HOME])
    renderApp(<Wrapper />)
    await flush()
    let taps = 0
    const tapBtn = async (name: string | RegExp) => {
      fireEvent.click(screen.getByRole('button', { name }))
      taps++
      await flush()
    }
    await tapBtn(/Åk hem/)
    expect(screen.getByText('Hämtar din position…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nu' })).toBeDisabled()
    await act(async () => { geo.ok?.({ coords: { latitude: 59.4, longitude: 17.8, accuracy: 20 } }) })
    await flush()
    expect(screen.getByRole('button', { name: 'Nu' })).toBeEnabled()
    await tapBtn('Nu')
    await tapBtn('Ja, boka nu')
    expect(taps).toBe(3)
    const post = f.mock.calls.find((c) => String(c[0]).includes('/api/rides') && c[1]?.method === 'POST')
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ toAddress: 'Storgatan 1, Kista', fromAddress: 'Sveavägen 12, Stockholm' })
  })

  it('slow GPS that fails after Åk hem: shows "Välj var du är" guidance', async () => {
    stubGeolocation('late')
    backend([HOME])
    renderApp(<Wrapper />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: /Åk hem/ }))
    await flush()
    await act(async () => { geo.err?.() })
    await flush()
    expect(screen.getByRole('button', { name: 'Välj var du är' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nu' })).toBeDisabled()
  })

  it('"Spara ditt hem" is not offered while saved places load or fail', async () => {
    stubGeolocation('denied')
    mockFetch(
      (u) => (u.pathname === '/api/saved-places' ? new Response('x', { status: 500 }) : undefined),
      (u) => (u.pathname === '/api/places/recent' ? json([]) : undefined)
    )
    renderApp(<Wrapper />)
    expect(screen.queryByRole('button', { name: /Spara ditt hem/ })).toBeNull()
    await flush()
    await flush()
    expect(screen.getByRole('button', { name: /Spara ditt hem/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Försök igen' })).toBeInTheDocument()
  })

  it('without GPS, Åk hem fills Home but asks for a pickup first', async () => {
    stubGeolocation('denied')
    backend([HOME])
    renderApp(<Wrapper />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: /Åk hem/ }))
    await flush()
    expect(draftNow.toAddress).toBe('Storgatan 1, Kista')
    expect(screen.queryByRole('button', { name: 'Nu' })).toBeNull()
  })

  it('no HOME saved: "Spara ditt hem" opens the add flow with HOME preselected', async () => {
    stubGeolocation('ok')
    backend([SCHOOL])
    renderApp(<Wrapper />)
    await flush()
    expect(screen.queryByRole('button', { name: /Åk hem/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Spara ditt hem/ }))
    await flush()
    expect(screen.getByText('add=HOME')).toBeInTheDocument()
  })

  it('a favorite chip fills the destination with one tap; recents are listed and fill it too', async () => {
    stubGeolocation('ok')
    backend([HOME, SCHOOL])
    renderApp(<Wrapper />)
    await flush()
    expect(screen.getByRole('button', { name: /Bio Rio/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Skolan/ }))
    expect([draftNow.toAddress, draftNow.toLat, draftNow.toLon]).toEqual(['Skolvägen 3', 59.6, 18.1])
    fireEvent.click(screen.getByRole('button', { name: /Bio Rio/ }))
    expect(draftNow.toAddress).toBe('Bio Rio, Söder')
  })

  it('saves a search result via ⭐ Spara (label prefilled, kind chosen)', async () => {
    stubGeolocation('denied')
    const f = backend([], [
      (u) =>
        u.pathname === '/api/places/search'
          ? json({ results: [{ provider: 'SL', providerPlaceId: 'k', kind: 'POI', name: 'Kista Galleria', area: 'Kista', formattedAddress: 'Kista Galleria, Kista', lat: 59.5, lon: 18.0, distanceKm: 3 }], hasMore: false, context: 'DEFAULT' })
          : undefined,
      (u, i) => (u.pathname === '/api/saved-places' && i?.method === 'POST' ? json({ ...SCHOOL, label: 'Jobbet' }) : undefined)
    ])
    renderApp(<Wrapper />)
    await flush()
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'kista' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(210) })
    fireEvent.click(screen.getByRole('button', { name: /Spara Kista Galleria/ }))
    expect(screen.getByLabelText('Namn')).toHaveValue('Kista Galleria')
    fireEvent.click(screen.getByRole('button', { name: /Jobb/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await flush()
    const post = f.mock.calls.find((c) => String(c[0]).includes('/api/saved-places') && c[1]?.method === 'POST')
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ label: 'Kista Galleria', kind: 'WORK', lat: 59.5, lon: 18.0 })
  })

  it('"Boka igen" arrival (state.step=when) opens the Nu / Välj tid step for the filled draft', async () => {
    stubGeolocation('denied')
    backend([HOME])
    renderApp(<Wrapper initial={{ ...defaultDraft, fromAddress: 'A-gatan 1', toAddress: 'B-gatan 2' }} />, { path: '/app', state: { step: 'when' } })
    await flush()
    expect(screen.getByRole('button', { name: 'Välj tid' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nu' })).toBeInTheDocument()
    expect(screen.getByTestId('nav-state').textContent).toBe('null') // used once: Back must not reopen it
  })
})
