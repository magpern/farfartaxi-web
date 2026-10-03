import { describe, expect, it } from 'vitest'
import { ride } from '../test/render'
import { groupDriverRides, groupPassengerRides } from './rideGroups'

const at = (id: number, status: string, iso: string, extra = {}) => ({ ...ride(status), id, scheduledAt: iso, ...extra })

describe('groupPassengerRides', () => {
  it('splits Pågående / Kommande / Tidigare and sorts each', () => {
    const g = groupPassengerRides([
      at(1, 'EN_ROUTE', '2026-10-25T10:00:00Z'),
      at(2, 'ACCEPTED', '2026-10-27T10:00:00Z', { kind: 'SCHEDULED' }),
      at(3, 'REQUESTED', '2026-10-26T10:00:00Z', { kind: 'SCHEDULED' }),
      at(4, 'COMPLETED', '2026-10-20T10:00:00Z'),
      at(5, 'CANCELLED', '2026-10-22T10:00:00Z'),
      at(6, 'REQUESTED', '2026-10-25T09:00:00Z', { kind: 'NOW' }),
      at(4, 'COMPLETED', '2026-10-20T10:00:00Z')
    ])
    expect(g.ongoing.map((r) => r.id)).toEqual([6, 1])
    expect(g.upcoming.map((r) => r.id)).toEqual([3, 2])
    expect(g.past.map((r) => r.id)).toEqual([5, 4])
  })
})

describe('groupDriverRides', () => {
  const now = new Date('2026-10-25T10:00:00Z')
  it('splits Idag / Kommande / Tidigare by Stockholm day', () => {
    const g = groupDriverRides(
      [
        at(1, 'ACCEPTED', '2026-10-25T14:00:00Z'),
        at(2, 'ACCEPTED', '2026-10-26T09:00:00Z'),
        at(3, 'PICKED_UP', '2026-10-24T22:00:00Z'),
        at(4, 'ACCEPTED', '2026-10-25T22:30:00Z') // 23:30 Stockholm: still today
      ],
      [at(5, 'COMPLETED', '2026-10-20T10:00:00Z'), at(6, 'CANCELLED', '2026-10-21T10:00:00Z')],
      now
    )
    expect(g.today.map((r) => r.id)).toEqual([3, 1, 4])
    expect(g.upcoming.map((r) => r.id)).toEqual([2])
    expect(g.past.map((r) => r.id)).toEqual([6, 5])
  })
})
