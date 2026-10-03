import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { BookingDraft } from '../lib/bookingDraft'
import { defaultDraft } from '../lib/bookingDraft'
import { BookingDraftContext } from '../shell/BookingDraftContext'
import { json, mockFetch } from '../test/fetchMock'
import { renderApp, ride } from '../test/render'
import { RidesPage } from './RidesPage'

function Where() {
  const l = useLocation()
  return <p data-testid="where">{`${l.pathname}|${JSON.stringify(l.state)}`}</p>
}

describe('Boka igen', () => {
  it('fills the draft with the same pickup and destination and goes to Nu / Välj tid', async () => {
    const past = ride('COMPLETED', [], { fromAddress: 'Torget 1', fromLat: 59.1, fromLon: 18.1, toAddress: 'Skolan', toLat: 59.2, toLon: 18.2 })
    mockFetch((u) => (u.pathname === '/api/rides/my' ? json(u.searchParams.get('history') === 'true' ? [past] : []) : undefined))
    let draft: BookingDraft = defaultDraft
    renderApp(
      <BookingDraftContext.Provider value={{ draft, setDraft: (v) => { draft = typeof v === 'function' ? v(draft) : v }, clearBookingDraft: () => {} }}>
        <RidesPage />
        <Where />
      </BookingDraftContext.Provider>,
      { path: '/app/resor' }
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Boka resan till Skolan igen' }))
    expect(draft).toMatchObject({ fromAddress: 'Torget 1', fromLat: 59.1, fromLon: 18.1, toAddress: 'Skolan', toLat: 59.2, toLon: 18.2 })
    expect(screen.getByTestId('where').textContent).toBe('/app|{"step":"when"}')
  })
})
