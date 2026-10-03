import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { json, mockFetch } from '../test/fetchMock'
import { useSavedPlaces } from './useSavedPlaces'


describe('useSavedPlaces', () => {
  it('ignores a slow response for passenger A that arrives after passenger B', async () => {
    let resolveA: (r: Response) => void = () => {}
    const place = (label: string) => ({ id: 1, label, address: 'x', formattedAddress: null, lat: 1, lon: 1, sortOrder: 0, kind: 'HOME', icon: null, provider: null, providerPlaceId: null })
    mockFetch((u) => {
      if (u.pathname !== '/api/saved-places') return undefined
      if (u.searchParams.get('userId') === '1') return new Promise<Response>((r) => { resolveA = r }) as unknown as Response
      return json([place('B-hem')])
    })
    const { result, rerender } = renderHook(({ id }) => useSavedPlaces('t', id), { initialProps: { id: 1 } })
    rerender({ id: 2 })
    await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
    expect(result.current.places?.[0].label).toBe('B-hem')
    await act(async () => {
      resolveA(json([place('A-hem')]))
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(result.current.places?.[0].label).toBe('B-hem')
  })
})
