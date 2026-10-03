import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '../i18n/context'
import type { RideAction, RideResponse } from '../lib/rideTypes'
import { DriverRideCard } from './DriverRideCard'
import { PassengerRideCard } from './PassengerRideCard'

function ride(status: string, actions: RideAction[], extra: Partial<RideResponse> = {}): RideResponse {
  return {
    id: 1, status, fromAddress: 'A', fromLat: 0, fromLon: 0, toAddress: 'B', toLat: 0, toLon: 0,
    scheduledAt: '2026-10-25T00:30:00Z', passengerId: 1, acceptedByDriverId: null, acceptedByDriverName: null,
    etaMinutes: null, lastDriverLat: null, lastDriverLon: null, lastLocationAt: null, availableActions: actions,
    ...extra
  }
}
const noop = () => {}

describe('ride cards are driven by availableActions', () => {
  it('passenger NO_DRIVER shows friendly text and only the offered buttons', () => {
    localStorage.setItem('farfartaxi-locale', 'sv')
    render(
      <I18nProvider>
        <PassengerRideCard ride={ride('NO_DRIVER', ['KEEP_WAITING', 'CANCEL'])} token="t" onToast={noop} onChanged={noop} />
      </I18nProvider>
    )
    expect(screen.getByText('Ingen förare har tackat ja än')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fortsätt vänta' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Avboka' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ändra tid' })).toBeNull()
    expect(screen.queryByText('NO_DRIVER')).toBeNull()
  })

  it('driver shows only offered actions, urgent badge and tel link', () => {
    localStorage.setItem('farfartaxi-locale', 'sv')
    render(
      <I18nProvider>
        <DriverRideCard
          ride={ride('REQUESTED', ['ACCEPT', 'DECLINE'], { urgent: true, passengerPhone: '070-123 45 67' })}
          token="t" onToast={noop} onChanged={noop}
        />
      </I18nProvider>
    )
    expect(screen.getByRole('button', { name: 'Ta resan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kan inte' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kör nu' })).toBeNull()
    expect(screen.getByText('Brådskande')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ring passageraren' })).toHaveAttribute('href', 'tel:0701234567')
  })
})
