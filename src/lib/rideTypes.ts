export type RideStatus =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'PICKED_UP'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_DRIVER'

export type RideAction =
  | 'CANCEL'
  | 'CANCEL_CONFIRM'
  | 'EDIT'
  | 'KEEP_WAITING'
  | 'ACCEPT'
  | 'DECLINE'
  | 'RETURN'
  | 'START'
  | 'ARRIVE'
  | 'PICKUP'
  | 'COMPLETE'
  | 'MESSAGE'

export type RideKind = 'NOW' | 'SCHEDULED'

export type RideResponse = {
  id: number
  status: string
  kind?: RideKind | null
  fromAddress: string
  fromLat: number
  fromLon: number
  toAddress: string
  toLat: number
  toLon: number
  scheduledAt: string
  passengerId: number
  acceptedByDriverId: number | null
  acceptedByDriverName: string | null
  etaMinutes: number | null
  lastDriverLat: number | null
  lastDriverLon: number | null
  lastLocationAt: string | null
  pickupNote?: string | null
  urgent?: boolean | null
  passengerName?: string | null
  passengerPhone?: string | null
  driverPhone?: string | null
  driverPhotoUrl?: string | null
  driverVehicleNote?: string | null
  arrivedAt?: string | null
  pickedUpAt?: string | null
  /** Only on PATCH responses. */
  lastEditMaterial?: boolean | null
  /** Drivers only: true when this driver's offer is a priority re-offer after the passenger changed the ride. */
  offerPriority?: boolean | null
  myOfferStatus?: string | null
  availableActions?: RideAction[] | null
}

export function hasAction(ride: RideResponse, action: RideAction): boolean {
  return ride.availableActions?.includes(action) ?? false
}

/** Statuses during which the driver's phone should stream its position. */
export const DRIVING_STATUSES: readonly string[] = ['EN_ROUTE', 'ARRIVED', 'PICKED_UP']

export const PICKUP_NOTE_MAX = 280

/** Strip everything except digits and a leading plus so tel: links work. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

export const PASSENGER_MESSAGE_CODES = ['PASSENGER_OUTSIDE', 'PASSENGER_TWO_MIN', 'PASSENGER_CALL_ME'] as const
export const DRIVER_MESSAGE_CODES = ['DRIVER_HERE', 'DRIVER_TWO_MIN', 'DRIVER_LATE'] as const
