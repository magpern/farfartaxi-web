export type Role = 'USER' | 'DRIVER' | 'ADMIN'

export type UserView = {
  id: number
  email: string
  fullName: string
  role: Role
  mustChangePassword: boolean
  hasLocalPassword: boolean
  approved: boolean
}

export type AuthResponse = {
  token: string
  user: UserView
}

/** Production admins are the grandparents who drive, so they get the driver shell too. */
export function isDriverRole(role: Role): boolean {
  return role === 'DRIVER' || role === 'ADMIN'
}

/** Where "book a ride" lives for this role (`/app` itself is the driver landing redirect for drivers). */
export function bookPath(role: Role): string {
  return isDriverRole(role) ? '/app/boka' : '/app'
}
