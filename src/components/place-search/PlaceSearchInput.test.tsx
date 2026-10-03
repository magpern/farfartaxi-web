import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n/context'
import type { PlaceResult } from '../../api/places'
import { calls, json, mockFetch } from '../../test/fetchMock'
import { PlaceSearchInput } from './PlaceSearchInput'
import { formatDistance } from './format'

const place = (over: Partial<PlaceResult>): PlaceResult => ({
  provider: 'SL', providerPlaceId: 'p1', kind: 'STOP', name: 'McDonalds', area: 'Järfälla',
  formattedAddress: 'McDonalds — Järfälla (hållplats)', lat: 59.4, lon: 17.8, distanceKm: 1.23, ...over
})

function Harness(props: {
  onSelect?: (p: PlaceResult, q: string) => void
  onClear?: () => void
  context?: Parameters<typeof PlaceSearchInput>[0]['context']
}) {
  const [v, setV] = useState('')
  return (
    <I18nProvider>
      <PlaceSearchInput
        token="tok"
        value={v}
        onChange={setV}
        onSelect={(p, q) => {
          setV(p.name)
          props.onSelect?.(p, q)
        }}
        onClear={() => {
          setV('')
          props.onClear?.()
        }}
        context={props.context}
        placeholder="Sök"
        ariaLabel="Sökfält"
        clearLabel="Rensa"
      />
    </I18nProvider>
  )
}

const type = (v: string) => fireEvent.change(screen.getByRole('combobox'), { target: { value: v } })
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => {
  localStorage.setItem('farfartaxi-locale', 'sv')
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('PlaceSearchInput', () => {
  it('waits for 2 characters and debounces 200 ms', async () => {
    const f = mockFetch((u) => (u.pathname === '/api/places/search' ? json({ results: [place({})], hasMore: false, context: 'DEFAULT' }) : undefined))
    render(<Harness />)
    type('m')
    await advance(500)
    expect(f).not.toHaveBeenCalled()
    type('mc')
    await advance(150)
    type('mcd')
    await advance(150)
    expect(f).not.toHaveBeenCalled()
    await advance(60)
    expect(calls(f, '/api/places/search')).toHaveLength(1)
    expect(calls(f, '/api/places/search')[0].searchParams.get('q')).toBe('mcd')
    expect(calls(f, '/api/places/search')[0].searchParams.get('limit')).toBe('8')
  })

  it('aborts the previous request; a stale response never overwrites a newer one', async () => {
    let resolveFirst: (r: Response) => void = () => {}
    const f = mockFetch((u) => {
      if (u.pathname !== '/api/places/search') return undefined
      if (u.searchParams.get('q') === 'kista') return new Promise<Response>((r) => { resolveFirst = r }) as unknown as Response
      return json({ results: [place({ name: 'Kista Galleria', kind: 'POI' })], hasMore: false, context: 'GPS' })
    })
    render(<Harness />)
    type('kista')
    await advance(210)
    const firstSignal = f.mock.calls[0][1]?.signal as AbortSignal
    type('kista g')
    await advance(210)
    expect(firstSignal.aborted).toBe(true)
    expect(screen.getByText('Kista Galleria')).toBeInTheDocument()
    await act(async () => resolveFirst(json({ results: [place({ name: 'Gammalt svar' })], hasMore: false, context: 'GPS' })))
    expect(screen.queryByText('Gammalt svar')).not.toBeInTheDocument()
    expect(screen.getByText('Kista Galleria')).toBeInTheDocument()
  })

  it('shows kind icons, bold name, area and distance', async () => {
    mockFetch(() =>
      json({
        results: [
          place({ kind: 'STOP', name: 'Stoppet', distanceKm: 1.2 }),
          place({ kind: 'ADDRESS', name: 'Sveavägen 12', area: 'Stockholm', distanceKm: 0.45 }),
          place({ kind: 'POI', name: 'Kista Galleria', area: null, distanceKm: null }),
          place({ kind: 'FAVORITE', name: 'Skolan' }),
          place({ kind: 'RECENT', name: 'Hemma hos farmor' })
        ],
        hasMore: false,
        context: 'GPS'
      })
    )
    render(<Harness />)
    type('sv')
    await advance(210)
    const opts = screen.getAllByRole('option')
    expect(opts.map((o) => o.textContent)).toEqual([
      '🚏StoppetJärfälla1,2 km',
      '🏠Sveavägen 12Stockholm450 m',
      '📍Kista Galleria',
      '⭐SkolanJärfälla1,2 km',
      '🕘Hemma hos farmorJärfälla1,2 km'
    ])
    expect(screen.getByText('Stoppet').tagName).toBe('STRONG')
    expect(formatDistance(1.234)).toBe('1,2 km')
  })

  it('shows a friendly empty state', async () => {
    mockFetch(() => json({ results: [], hasMore: false, context: 'DEFAULT' }))
    render(<Harness />)
    type('zzz')
    await advance(210)
    expect(screen.getByText('Inga träffar.')).toBeInTheDocument()
  })

  it('shows an error state when the search fails', async () => {
    mockFetch(() => new Response('x', { status: 500 }))
    render(<Harness />)
    type('abc')
    await advance(210)
    expect(screen.getByText(/Sökningen fungerade inte/)).toBeInTheDocument()
  })

  it('"Visa fler" re-queries with limit 25', async () => {
    const f = mockFetch(() => json({ results: [place({})], hasMore: true, context: 'GPS' }))
    render(<Harness />)
    type('mcd')
    await advance(210)
    fireEvent.click(screen.getByRole('button', { name: 'Visa fler' }))
    await advance(210)
    const searches = calls(f, '/api/places/search')
    expect(searches.at(-1)?.searchParams.get('limit')).toBe('25')
    expect(screen.queryByRole('button', { name: 'Visa fler' })).not.toBeInTheDocument()
  })

  it('sends GPS with accuracy and the pickup as context', async () => {
    const f = mockFetch(() => json({ results: [], hasMore: false, context: 'GPS' }))
    render(<Harness context={{ gps: { lat: 59.1, lon: 17.9, accuracy: 35.4 }, pickup: { lat: 59.2, lon: 17.8 } }} />)
    type('mcd')
    await advance(210)
    const p = calls(f, '/api/places/search')[0].searchParams
    expect([p.get('lat'), p.get('lon'), p.get('accuracy'), p.get('pickupLat'), p.get('pickupLon')]).toEqual(['59.1', '17.9', '35', '59.2', '17.8'])
  })

  it('records the selection with the typed query (fire-and-forget) and reports it', async () => {
    const onSelect = vi.fn()
    const f = mockFetch(
      (u, init) => (u.pathname === '/api/places/selections' && init?.method === 'POST' ? new Response(null, { status: 500 }) : undefined),
      () => json({ results: [place({})], hasMore: false, context: 'GPS' })
    )
    render(<Harness onSelect={onSelect} />)
    type('donken')
    await advance(210)
    fireEvent.click(screen.getByRole('option'))
    await advance(10)
    const post = f.mock.calls.find((c) => String(c[0]).includes('/api/places/selections'))!
    expect(JSON.parse(String(post[1]?.body))).toEqual({
      query: 'donken', provider: 'SL', providerPlaceId: 'p1', name: 'McDonalds', lat: 59.4, lon: 17.8
    })
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'McDonalds' }), 'donken')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('✕ clears the field, closes the list and calls onClear', async () => {
    mockFetch(() => json({ results: [place({})], hasMore: false, context: 'GPS' }))
    const onClear = vi.fn()
    render(<Harness onClear={onClear} />)
    type('mcd')
    await advance(210)
    fireEvent.click(screen.getByRole('button', { name: 'Rensa' }))
    expect(onClear).toHaveBeenCalled()
    expect(screen.getByRole('combobox')).toHaveValue('')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('supports keyboard selection via aria-activedescendant', async () => {
    const onSelect = vi.fn()
    mockFetch(() => json({ results: [place({ name: 'A' }), place({ name: 'B', providerPlaceId: 'p2' })], hasMore: false, context: 'GPS' }))
    render(<Harness onSelect={onSelect} />)
    type('ab')
    await advance(210)
    const box = screen.getByRole('combobox')
    expect(box).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    expect(box.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[1].id)
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'B' }), 'ab')
  })
})

