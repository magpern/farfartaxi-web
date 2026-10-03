import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '../i18n/context'
import { ShellContext, type ShellValue } from '../shell/ShellContext'
import type { Role, UserView } from '../shell/types'
import type { RideAction, RideResponse } from '../lib/rideTypes'

export const user = (role: Role = 'USER', id = 1): UserView => ({
  id,
  email: 'a@b.se',
  fullName: 'Anna Berg',
  role,
  mustChangePassword: false,
  hasLocalPassword: true,
  approved: true
})

export function ride(status: string, actions: RideAction[] = [], extra: Partial<RideResponse> = {}): RideResponse {
  return {
    id: 7, status, fromAddress: 'Storgatan 1', fromLat: 0, fromLon: 0, toAddress: 'Skolan', toLat: 0, toLon: 0,
    scheduledAt: '2026-10-25T12:30:00Z', passengerId: 1, acceptedByDriverId: null, acceptedByDriverName: null,
    etaMinutes: null, lastDriverLat: null, lastDriverLon: null, lastLocationAt: null, availableActions: actions,
    ...extra
  }
}

export function renderApp(ui: ReactElement, opts: { path?: string; state?: unknown; role?: Role; shell?: Partial<ShellValue> } = {}) {
  localStorage.setItem('farfartaxi-locale', 'sv')
  const shell: ShellValue = {
    user: user(opts.role),
    token: 't',
    onToast: () => {},
    largeText: false,
    setLargeText: () => {},
    showInstall: false,
    openInstall: () => {},
    logout: async () => {},
    ...opts.shell
  }
  return render(
    <I18nProvider>
      <ShellContext.Provider value={shell}>
        <MemoryRouter initialEntries={[opts.state !== undefined ? { pathname: opts.path ?? '/app', state: opts.state } : (opts.path ?? '/app')]}>{ui}</MemoryRouter>
      </ShellContext.Provider>
    </I18nProvider>
  )
}
