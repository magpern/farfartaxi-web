import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultDraft } from '../lib/bookingDraft'
import { ride, renderApp } from '../test/render'
import { BookingDraftContext } from '../shell/BookingDraftContext'

let activeValue: { active: unknown; loaded: boolean; refresh: () => Promise<void> }
vi.mock('../shell/ActiveRide', () => ({ useActiveRide: () => activeValue }))
vi.mock('./BookingPage', () => ({ BookingPage: () => <div>booking-form</div> }))

import { HomePage } from './HomePage'

const draftCtx = { draft: defaultDraft, setDraft: () => {}, clearBookingDraft: () => {} }
const show = (path: string) =>
  renderApp(
    <BookingDraftContext.Provider value={draftCtx}>
      <HomePage />
    </BookingDraftContext.Provider>,
    { path }
  )

beforeEach(() => {
  activeValue = { active: { role: 'PASSENGER', ride: ride('ACCEPTED', [], { acceptedByDriverName: 'Folke Berg' }) }, loaded: true, refresh: async () => {} }
})

describe('passenger home with an active ride', () => {
  it('shows the ride card and a "Boka en till resa" button that reveals the form', async () => {
    show('/app')
    expect(screen.getByText('Folke hämtar dig')).toBeInTheDocument()
    expect(screen.queryByText('booking-form')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Boka en till resa' }))
    expect(screen.getByText('booking-form')).toBeInTheDocument()
    expect(screen.getByText('Folke hämtar dig')).toBeInTheDocument()
  })

  it('/app/boka shows the form right away next to the ride card', () => {
    show('/app/boka')
    expect(screen.getByText('booking-form')).toBeInTheDocument()
    expect(screen.getByText('Folke hämtar dig')).toBeInTheDocument()
  })

  it('without an active ride it is just the form', () => {
    activeValue = { active: null, loaded: true, refresh: async () => {} }
    show('/app')
    expect(screen.getByText('booking-form')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Boka en till resa' })).toBeNull()
  })
})
