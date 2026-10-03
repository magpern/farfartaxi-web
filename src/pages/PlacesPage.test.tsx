import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { calls, json, mockFetch } from '../test/fetchMock'
import { renderApp } from '../test/render'
import { PlacesPage } from './PlacesPage'

const P = (id: number, label: string, kind: string, sortOrder = id) => ({
  id, label, address: `${label}gatan 1`, formattedAddress: null, lat: 59 + id / 10, lon: 18, sortOrder, kind, icon: null, provider: null, providerPlaceId: null
})
let list: ReturnType<typeof P>[]

function backend() {
  return mockFetch(
    (u, i) => (u.pathname === '/api/saved-places' && (!i?.method || i.method === 'GET') ? json(list) : undefined),
    (u) => (u.pathname === '/api/users/for-booking' ? json([{ id: 9, fullName: 'Lisa Berg', email: 'l@b.se' }]) : undefined),
    (u, i) => (u.pathname.startsWith('/api/saved-places') && i?.method && i.method !== 'GET' ? json({ ...list[0] }) : undefined)
  )
}
const sentBody = (f: ReturnType<typeof backend>, method: string) => {
  const c = f.mock.calls.find((x) => x[1]?.method === method)
  return c ? JSON.parse(String(c[1]?.body ?? 'null')) : undefined
}

beforeEach(() => {
  list = [P(1, 'Hem', 'HOME'), P(2, 'Skolan', 'SCHOOL')]
})

describe('Places page', () => {
  it('shows a one-line explanation when empty', async () => {
    list = []
    backend()
    renderApp(<PlacesPage />, { path: '/app/platser' })
    expect(await screen.findByText(/Spara hem, skolan/)).toBeInTheDocument()
  })

  it('renames and changes kind with PATCH', async () => {
    const f = backend()
    renderApp(<PlacesPage />, { path: '/app/platser' })
    await userEvent.click(await screen.findByRole('button', { name: 'Ändra Skolan' }))
    const name = screen.getByLabelText('Namn')
    await userEvent.clear(name)
    await userEvent.type(name, 'Gymnasiet')
    await userEvent.click(screen.getByRole('button', { name: /Idrott/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(() => expect(sentBody(f, 'PATCH')).toEqual({ label: 'Gymnasiet', kind: 'SPORTS' }))
    expect(calls(f, '/api/saved-places/2')).toHaveLength(1)
  })

  it('reorders with move buttons (PUT /order) and deletes after confirm', async () => {
    const f = backend()
    renderApp(<PlacesPage />, { path: '/app/platser' })
    await userEvent.click(await screen.findByRole('button', { name: 'Flytta upp Skolan' }))
    await waitFor(() => expect(sentBody(f, 'PUT')).toEqual({ ids: [2, 1] }))
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Skolan')

    await userEvent.click(screen.getByRole('button', { name: 'Ta bort Hem' }))
    expect(f.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Ta bort' }))
    await waitFor(() => expect(f.mock.calls.some((c) => c[1]?.method === 'DELETE' && String(c[0]).endsWith('/api/saved-places/1'))).toBe(true))
    await waitFor(() => expect(screen.queryByText('Hem')).toBeNull())
  })

  it('a driver manages a passenger\'s places via ?userId=', async () => {
    const f = backend()
    renderApp(<PlacesPage />, { path: '/app/platser?userId=9', role: 'DRIVER' })
    expect(await screen.findByText('Platser för Lisa Berg')).toBeInTheDocument()
    expect(calls(f, '/api/saved-places')[0].searchParams.get('userId')).toBe('9')
    await userEvent.click(screen.getByRole('button', { name: 'Flytta upp Skolan' }))
    await waitFor(() => expect(f.mock.calls.some((c) => c[1]?.method === 'PUT')).toBe(true))
    const put = calls(f, '/api/saved-places/order')[0]
    expect(put.searchParams.get('userId')).toBe('9')
  })

  it('a driver can choose a passenger from the picker', async () => {
    const f = backend()
    renderApp(<PlacesPage />, { path: '/app/platser', role: 'DRIVER' })
    const sel = await screen.findByLabelText('Platser för…')
    await waitFor(() => expect(screen.getByRole('option', { name: 'Lisa Berg' })).toBeInTheDocument())
    fireEvent.change(sel, { target: { value: '9' } })
    await waitFor(() => expect(calls(f, '/api/saved-places').some((u) => u.searchParams.get('userId') === '9')).toBe(true))
  })
})
