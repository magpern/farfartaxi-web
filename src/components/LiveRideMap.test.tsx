import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n/context'
import { json, mockFetch } from '../test/fetchMock'
import { LiveRideMap } from './LiveRideMap'

const pickup = { lat: 59, lon: 18 }
const destination = { lat: 59.1, lon: 18.1 }
const osrm = { code: 'Ok', routes: [{ geometry: { coordinates: [[18, 59], [18.1, 59.1]] } }] }
const flush = () => act(async () => {})

function show(props: { token?: string; shareToken?: string }) {
  return render(
    <I18nProvider>
      <LiveRideMap pickup={pickup} destination={destination} car={null} target="PICKUP" {...props} />
    </I18nProvider>
  )
}
const auth = (init?: unknown) => new Headers((init as RequestInit).headers).get('Authorization')

afterEach(() => vi.unstubAllGlobals())

describe('LiveRideMap route', () => {
  it('authenticated screen uses /api/route/driving with the bearer token', async () => {
    const fn = mockFetch((u) => (u.pathname === '/api/route/driving' ? json(osrm) : undefined))
    show({ token: 'tkn' })
    await flush()
    expect(fn).toHaveBeenCalledTimes(1)
    const [url, init] = fn.mock.calls[0]
    const u = new URL(String(url), 'http://localhost')
    expect(u.pathname).toBe('/api/route/driving')
    expect(Object.fromEntries(u.searchParams)).toEqual({ fromLat: '59', fromLon: '18', toLat: '59.1', toLon: '18.1' })
    expect(auth(init)).toBe('Bearer tkn')
  })

  it('share page uses the public share route with no params and no authenticated calls', async () => {
    const fn = mockFetch((u) => (u.pathname === '/api/public/share/tok%2F1/route' || u.pathname === '/api/public/share/tok/route' ? json(osrm) : undefined))
    show({ shareToken: 'tok' })
    await flush()
    expect(fn).toHaveBeenCalledTimes(1)
    const [url, init] = fn.mock.calls[0]
    const u = new URL(String(url), 'http://localhost')
    expect(u.pathname).toBe('/api/public/share/tok/route')
    expect(u.search).toBe('')
    expect(auth(init)).toBeNull()
    expect(String(url)).not.toContain('/api/route/driving')
  })

  it('swallows 429 and errors without throwing', async () => {
    mockFetch(() => json({ error: 'slow down' }, 429))
    const { container } = show({ token: 'tkn' })
    await flush()
    expect(container.querySelector('.leaflet-overlay-pane path')).toBeNull()
  })

  it('unmounting mid-animation (tween, fit, pending route) does not throw', async () => {
    mockFetch((u) => (u.pathname === '/api/route/driving' ? json(osrm) : undefined))
    const errors: unknown[] = []
    const onError = (e: ErrorEvent) => errors.push(e.error ?? e.message)
    window.addEventListener('error', onError)
    const ui = (lat: number) => (
      <I18nProvider>
        <LiveRideMap pickup={pickup} destination={destination} car={{ lat, lon: 18.02 }} target="PICKUP" token="tkn" />
      </I18nProvider>
    )
    const { rerender, unmount } = render(ui(59.01))
    rerender(ui(59.02)) // starts a marker tween and a refit
    expect(() => unmount()).not.toThrow()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400))
    })
    window.removeEventListener('error', onError)
    expect(errors).toEqual([])
  })
})
