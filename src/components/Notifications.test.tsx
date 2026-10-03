import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockFetch, noContent } from '../test/fetchMock'
import { renderApp } from '../test/render'

const env = vi.hoisted(() => ({
  ios: false,
  standalone: false,
  supported: true,
  permission: 'default' as NotificationPermission
}))
vi.mock('../lib/push/env', () => ({
  isIos: () => env.ios,
  isStandalone: () => env.standalone,
  pushSupported: () => env.supported,
  getPermission: () => (env.supported ? env.permission : 'unsupported')
}))
const hasSub = vi.hoisted(() => ({ value: true }))
vi.mock('../lib/push/hasSubscription', () => ({ hasPushSubscription: async () => hasSub.value }))
const subscribeMock = vi.hoisted(() => vi.fn())
vi.mock('../lib/push/subscription', () => ({
  subscribe: subscribeMock,
  ensureSubscribed: vi.fn(),
  unsubscribeOnLogout: vi.fn()
}))

import { I18nProvider, useI18n } from '../i18n/context'
import { useLocaleSync } from '../lib/push'
import { PwaInstallModal } from '../PwaInstallModal'
import { MorePage } from '../pages/MorePage'
import { NotificationPrompt } from './NotificationPrompt'

beforeEach(() => {
  Object.assign(env, { ios: false, standalone: false, supported: true, permission: 'default' })
  hasSub.value = true
  subscribeMock.mockReset()
  localStorage.clear()
})

describe('NotificationPrompt snooze', () => {
  it('Inte nu hides the card for 7 days, per user', async () => {
    const { unmount } = renderApp(<NotificationPrompt />)
    await userEvent.click(screen.getByRole('button', { name: 'Inte nu' }))
    expect(screen.queryByRole('button', { name: 'Slå på notiser' })).not.toBeInTheDocument()
    unmount()
    renderApp(<NotificationPrompt />)
    expect(screen.queryByRole('button', { name: 'Slå på notiser' })).not.toBeInTheDocument()
    localStorage.setItem('farfartaxi-notif-snoozed-1', String(Date.now() - 8 * 24 * 3600_000))
    localStorage.setItem('farfartaxi-locale', 'sv')
    cleanup()
    renderApp(<NotificationPrompt />)
    expect(screen.getByRole('button', { name: 'Slå på notiser' })).toBeInTheDocument()
  })
})

describe('NotificationPrompt card states', () => {
  it('default: passenger sees the enable card and why', async () => {
    subscribeMock.mockImplementation(async () => {
      env.permission = 'granted'
      return 'granted'
    })
    const toast = vi.fn()
    renderApp(<NotificationPrompt />, { shell: { onToast: toast } })
    expect(screen.getByText('Så du vet när farfar är på väg')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Slå på notiser' }))
    expect(subscribeMock).toHaveBeenCalledWith('t')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Slå på notiser' })).not.toBeInTheDocument())
    expect(toast).toHaveBeenCalledWith('Notiser är på.')
  })

  it('default: drivers get the driver wording', () => {
    renderApp(<NotificationPrompt />, { role: 'DRIVER' })
    expect(screen.getByText('Så du ser nya resor direkt')).toBeInTheDocument()
  })

  it('denied: one dismissible settings hint that stays dismissed', async () => {
    env.permission = 'denied'
    const { unmount } = renderApp(<NotificationPrompt />)
    expect(screen.getByText('Notiser är blockerade')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Stäng' }))
    expect(screen.queryByText('Notiser är blockerade')).not.toBeInTheDocument()
    unmount()
    renderApp(<NotificationPrompt />)
    expect(screen.queryByText('Notiser är blockerade')).not.toBeInTheDocument()
  })

  it('granted: nothing', () => {
    env.permission = 'granted'
    const { container } = renderApp(<NotificationPrompt />)
    expect(container).toBeEmptyDOMElement()
  })

  it('iOS not installed: no permission card (the install guide comes first)', () => {
    env.ios = true
    env.supported = false
    const { container } = renderApp(<NotificationPrompt />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('iOS install guide', () => {
  it('shows the share steps on iOS Safari and remembers the dismissal', async () => {
    localStorage.setItem('farfartaxi-locale', 'sv')
    env.ios = true
    const onClose = vi.fn()
    render(
      <I18nProvider>
        <PwaInstallModal open onClose={onClose} />
      </I18nProvider>
    )
    expect(screen.getByRole('heading', { name: 'Installera appen först' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Dela-knappen' })).toBeInTheDocument()
    expect(screen.getByText(/Lägg till på hemskärmen/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Inte nu' }))
    expect(onClose).toHaveBeenCalled()
    expect(Number(localStorage.getItem('farfartaxi-ios-install-dismissed'))).toBeGreaterThan(0)
  })
})

describe('Mer → Notiser', () => {
  function prefsRoutes(initial = {}) {
    const state = { rideRequests: true, rideUpdates: true, reminders: true, ...initial }
    const f = mockFetch(
      (u, i) => (u.pathname === '/api/me/notification-prefs' && (i?.method ?? 'GET') === 'GET' ? json(state) : undefined),
      (u, i) => (u.pathname === '/api/me/notification-prefs' && i?.method === 'PUT' ? noContent() : undefined)
    )
    return f
  }
  const puts = (f: ReturnType<typeof prefsRoutes>) =>
    f.mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PUT').map((c) => JSON.parse((c[1] as RequestInit).body as string))

  it('shows status På and three toggles for drivers; toggling PUTs the prefs', async () => {
    env.permission = 'granted'
    const f = prefsRoutes({ reminders: false })
    renderApp(<MorePage />, { role: 'DRIVER' })
    await waitFor(() => expect(screen.getByTestId('push-status')).toHaveTextContent('På'))
    const reminders = await screen.findByRole('checkbox', { name: /Påminnelser/ })
    await waitFor(() => expect(reminders).toBeEnabled())
    expect(reminders).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Nya resor/ })).toBeChecked()
    await userEvent.click(reminders)
    await waitFor(() => expect(puts(f)).toEqual([{ rideRequests: true, rideUpdates: true, reminders: true }]))
  })

  it('granted without a subscription shows Inte aktiverad with an activate button', async () => {
    env.permission = 'granted'
    hasSub.value = false
    prefsRoutes()
    renderApp(<MorePage />)
    await waitFor(() => expect(screen.getByTestId('push-status')).toHaveTextContent('Inte aktiverad'))
    expect(screen.getByRole('button', { name: 'Slå på notiser' })).toBeInTheDocument()
  })

  it('blocked hint is iOS-specific on iOS', () => {
    env.permission = 'denied'
    env.ios = true
    env.standalone = true
    mockFetch(() => json({}))
    renderApp(<MorePage />)
    expect(screen.getByText(/Inställningar → Notiser → Farfartaxi/)).toBeInTheDocument()
  })

  it('passengers see only Resuppdateringar and Påminnelser', async () => {
    env.permission = 'default'
    prefsRoutes()
    renderApp(<MorePage />)
    expect(screen.getByTestId('push-status')).toHaveTextContent('Av')
    expect(screen.getByRole('checkbox', { name: /Resuppdateringar/ })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Påminnelser/ })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Nya resor/ })).not.toBeInTheDocument()
  })

  it('reverts a toggle and tells the user when saving fails', async () => {
    env.permission = 'granted'
    mockFetch(
      (u, i) => (u.pathname === '/api/me/notification-prefs' && (i?.method ?? 'GET') === 'GET' ? json({}) : undefined),
      (u, i) => (u.pathname === '/api/me/notification-prefs' && i?.method === 'PUT' ? json({ error: 'x' }, 500) : undefined)
    )
    const toast = vi.fn()
    renderApp(<MorePage />, { shell: { onToast: toast } })
    const box = await screen.findByRole('checkbox', { name: /Resuppdateringar/ })
    await waitFor(() => expect(box).toBeEnabled())
    await userEvent.click(box)
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Kunde inte spara. Försök igen.'))
    expect(box).toBeChecked()
  })

  it('shows Blockerad when denied and Installera-first when on iOS Safari', () => {
    env.permission = 'denied'
    mockFetch(() => json({}))
    const { unmount } = renderApp(<MorePage />)
    expect(screen.getByTestId('push-status')).toHaveTextContent('Blockerad')
    unmount()
    env.ios = true
    env.supported = false
    renderApp(<MorePage />)
    expect(screen.getByText('Installera appen först för att få notiser.')).toBeInTheDocument()
  })
})

describe('locale sync', () => {
  function Probe() {
    const { setLocale } = useI18n()
    useLocaleSync('tok', 1)
    return <button onClick={() => setLocale('en')}>en</button>
  }

  it('PUTs the locale on start and again on language switch', async () => {
    localStorage.setItem('farfartaxi-locale', 'sv')
    const f = mockFetch((u) => (u.pathname === '/api/me/locale' ? noContent() : undefined))
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    )
    const bodies = () => f.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string).locale)
    await waitFor(() => expect(bodies()).toEqual(['sv']))
    await userEvent.click(screen.getByText('en'))
    await waitFor(() => expect(bodies()).toEqual(['sv', 'en']))
  })
})
