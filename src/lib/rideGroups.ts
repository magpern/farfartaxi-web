import { DRIVING_STATUSES, TERMINAL_STATUSES, type RideResponse } from './rideTypes'
import { stockholmDayKey } from './time'

const isTerminal = (r: RideResponse) => TERMINAL_STATUSES.includes(r.status)
const byTimeAsc = (a: RideResponse, b: RideResponse) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)
const byTimeDesc = (a: RideResponse, b: RideResponse) => byTimeAsc(b, a)

function uniqueById(rides: RideResponse[]): RideResponse[] {
  const seen = new Set<number>()
  return rides.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
}

export type PassengerGroups = { ongoing: RideResponse[]; upcoming: RideResponse[]; past: RideResponse[] }

/** Passenger history split: Pågående (driver on the way / ride under way / "Åk nu" waiting), Kommande, Tidigare. */
export function groupPassengerRides(rides: RideResponse[]): PassengerGroups {
  const all = uniqueById(rides)
  const live = all.filter((r) => !isTerminal(r))
  const ongoing = live.filter((r) => DRIVING_STATUSES.includes(r.status) || r.kind === 'NOW')
  const upcoming = live.filter((r) => !ongoing.includes(r))
  return {
    ongoing: ongoing.sort(byTimeAsc),
    upcoming: upcoming.sort(byTimeAsc),
    past: all.filter(isTerminal).sort(byTimeDesc)
  }
}

export type DriverGroups = { today: RideResponse[]; upcoming: RideResponse[]; past: RideResponse[] }

/** Driver split: Idag (today in Stockholm, or already driving), Kommande (later days), Tidigare. */
export function groupDriverRides(mine: RideResponse[], history: RideResponse[], now: Date = new Date()): DriverGroups {
  const todayKey = stockholmDayKey(now)
  const all = uniqueById([...mine, ...history])
  const live = all.filter((r) => !isTerminal(r))
  const today = live.filter(
    (r) => DRIVING_STATUSES.includes(r.status) || stockholmDayKey(r.scheduledAt) <= todayKey
  )
  const upcoming = live.filter((r) => !today.includes(r))
  return {
    today: today.sort(byTimeAsc),
    upcoming: upcoming.sort(byTimeAsc),
    past: all.filter(isTerminal).sort(byTimeDesc)
  }
}
