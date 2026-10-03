import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '../i18n/context'
import { selectMessages, type RideMessage } from '../lib/rideMessages'
import { RideMessages } from './RideMessages'

const now = Date.parse('2026-10-25T00:30:00Z')
const msg = (id: number, senderId: number, code: string, iso: string): RideMessage => ({ id, senderId, code, createdAt: iso })
const list = [
  msg(1, 1, 'PASSENGER_OUTSIDE', '2026-10-25T00:00:00Z'),
  msg(2, 9, 'DRIVER_HERE', '2026-10-25T00:25:00Z'),
  msg(3, 1, 'PASSENGER_TWO_MIN', '2026-10-25T00:26:00Z'),
  msg(4, 9, 'DRIVER_LATE', '2026-10-24T23:00:00Z')
]
const mine = (m: RideMessage) => m.senderId === 1

describe('selectMessages', () => {
  it('returns the latest 3 newest first and highlights the newest recent message from the other party', () => {
    const out = selectMessages(list, mine, now)
    expect(out.map((m) => m.id)).toEqual([3, 2, 1])
    expect(out.filter((m) => m.highlight).map((m) => m.id)).toEqual([2])
  })
  it('does not highlight when the other party message is older than 10 minutes', () => {
    expect(selectMessages(list, mine, now + 20 * 60_000).some((m) => m.highlight)).toBe(false)
  })
})

describe('RideMessages', () => {
  it('renders friendly lines with sender, canned text and Stockholm time', () => {
    localStorage.setItem('farfartaxi-locale', 'sv')
    render(
      <I18nProvider>
        <RideMessages messages={list} isMine={mine} otherName="Farfar" now={now} />
      </I18nProvider>
    )
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Du: Kommer om 2 min 02:26')
    expect(items[1]).toHaveTextContent('Farfar: Jag är här 02:25')
    expect(items[1]).toHaveClass('ride-message-new')
    expect(items[0]).not.toHaveClass('ride-message-new')
  })
})
