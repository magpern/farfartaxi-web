import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockFetch, json, noContent, calls } from '../../test/fetchMock'
import { getPermission, isIos, isStandalone, pushSupported } from './env'
import { shouldShowIosInstallGuide, snoozeIosInstallGuide, IOS_INSTALL_SNOOZE_MS } from './installGuide'
import { getNotificationPrefs, putNotificationPrefs, syncLocale } from './prefs'
import { ensureSubscribed, subscribe, unsubscribeOnLogout, urlBase64ToUint8Array } from './subscription'

const KEY_B64 = 'BAUF' // 3 bytes -> 4 chars
const keyBytes = urlBase64ToUint8Array(KEY_B64)

type FakeSub = ReturnType<typeof fakeSub>
function fakeSub(endpoint = 'https://push.example/abc', key: Uint8Array = keyBytes) {
  return {
    endpoint,
    options: { applicationServerKey: key.buffer.slice(0) },
    toJSON: () => ({ endpoint, keys: { p256dh: 'P', auth: 'A' } }),
    unsubscribe: vi.fn().mockResolvedValue(true)
  }
}

let existing: FakeSub | null
let pm: { getSubscription: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> }
let permission: NotificationPermission
let request: ReturnType<typeof vi.fn>

function installPush(opts: { permission?: NotificationPermission; sub?: FakeSub | null } = {}) {
  permission = opts.permission ?? 'default'
  existing = opts.sub ?? null
  pm = {
    getSubscription: vi.fn(async () => existing),
    subscribe: vi.fn(async () => (existing = fakeSub()))
  }
  const registration = { pushManager: pm }
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve(registration), getRegistration: async () => registration }
  })
  vi.stubGlobal('PushManager', class {})
  request = vi.fn(async () => {
    permission = 'granted'
    return 'granted' as NotificationPermission
  })
  vi.stubGlobal('Notification', Object.assign(function () {}, { requestPermission: request }))
  Object.defineProperty(Notification, 'permission', { configurable: true, get: () => permission })
}

const routes = [
  (u: URL) => (u.pathname === '/api/public/push-config' ? json({ publicKey: KEY_B64 }) : undefined),
  (u: URL, i?: RequestInit) => (u.pathname === '/api/push/subscriptions' && i?.method === 'POST' ? noContent() : undefined),
  (u: URL, i?: RequestInit) => (u.pathname === '/api/push/subscriptions' && i?.method === 'DELETE' ? noContent() : undefined)
]

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  // @ts-expect-error remove the stub so other tests see a plain jsdom
  delete navigator.serviceWorker
})

describe('environment detection', () => {
  it('is unsupported in plain jsdom', () => {
    expect(pushSupported()).toBe(false)
    expect(getPermission()).toBe('unsupported')
  })
  it('reports permission once supported', () => {
    installPush({ permission: 'denied' })
    expect(pushSupported()).toBe(true)
    expect(getPermission()).toBe('denied')
  })
  it('detects iOS and standalone', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    expect(isIos()).toBe(true)
    expect(isStandalone()).toBe(false)
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    expect(isStandalone()).toBe(true)
    vi.restoreAllMocks()
  })
})

describe('subscribe', () => {
  it('requests permission, subscribes with the server key and posts the payload', async () => {
    installPush()
    const f = mockFetch(...routes)
    expect(await subscribe('tok')).toBe('granted')
    expect(request).toHaveBeenCalledTimes(1)
    const opts = pm.subscribe.mock.calls[0][0]
    expect(opts.userVisibleOnly).toBe(true)
    expect(Array.from(opts.applicationServerKey)).toEqual(Array.from(keyBytes))
    const post = f.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'POST')!
    expect(new URL(String(post[0]), 'http://x').pathname).toBe('/api/push/subscriptions')
    expect(JSON.parse((post[1] as RequestInit).body as string)).toEqual({
      endpoint: 'https://push.example/abc',
      p256dh: 'P',
      auth: 'A',
      userAgent: navigator.userAgent
    })
    expect(((post[1] as RequestInit).headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('does not subscribe or call the backend when permission is denied', async () => {
    installPush()
    request.mockResolvedValue('denied')
    const f = mockFetch(...routes)
    expect(await subscribe('tok')).toBe('denied')
    expect(pm.subscribe).not.toHaveBeenCalled()
    expect(f).not.toHaveBeenCalled()
  })

  it('returns unsupported without prompting when push is unavailable', async () => {
    expect(await subscribe('tok')).toBe('unsupported')
  })

  it('reports no-key when the server has no VAPID key', async () => {
    installPush()
    mockFetch((u) => (u.pathname === '/api/public/push-config' ? json({ publicKey: '' }) : undefined))
    expect(await subscribe('tok')).toBe('no-key')
    expect(pm.subscribe).not.toHaveBeenCalled()
  })
})

describe('ensureSubscribed', () => {
  it('does nothing unless permission is granted (never prompts)', async () => {
    installPush({ permission: 'default' })
    const f = mockFetch(...routes)
    expect(await ensureSubscribed('tok')).toBe(false)
    expect(request).not.toHaveBeenCalled()
    expect(f).not.toHaveBeenCalled()
  })

  it('re-subscribes when granted but the subscription is gone, and tells the server', async () => {
    installPush({ permission: 'granted', sub: null })
    const f = mockFetch(...routes)
    expect(await ensureSubscribed('tok')).toBe(true)
    expect(pm.subscribe).toHaveBeenCalledTimes(1)
    expect(calls(f, '/api/push/subscriptions')).toHaveLength(1)
  })

  it('keeps a valid subscription but re-syncs it to the server', async () => {
    installPush({ permission: 'granted', sub: fakeSub() })
    const f = mockFetch(...routes)
    expect(await ensureSubscribed('tok')).toBe(true)
    expect(pm.subscribe).not.toHaveBeenCalled()
    expect(calls(f, '/api/push/subscriptions')).toHaveLength(1)
  })

  it('replaces a subscription made with an outdated server key', async () => {
    const old = fakeSub('https://push.example/old', new Uint8Array([9, 9, 9]))
    installPush({ permission: 'granted', sub: old })
    mockFetch(...routes)
    await ensureSubscribed('tok')
    expect(old.unsubscribe).toHaveBeenCalled()
    expect(pm.subscribe).toHaveBeenCalledTimes(1)
  })

  it('never throws on backend errors', async () => {
    installPush({ permission: 'granted' })
    mockFetch(() => json({ error: 'x' }, 500))
    expect(await ensureSubscribed('tok')).toBe(false)
  })
})

describe('unsubscribeOnLogout', () => {
  it('deletes the endpoint server-side and unsubscribes the browser', async () => {
    const sub = fakeSub('https://push.example/a b')
    installPush({ permission: 'granted', sub })
    const f = mockFetch(...routes)
    await unsubscribeOnLogout('tok')
    const del = f.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'DELETE')!
    expect(String(del[0])).toBe(`/api/push/subscriptions?endpoint=${encodeURIComponent('https://push.example/a b')}`)
    expect(sub.unsubscribe).toHaveBeenCalled()
  })

  it('still unsubscribes in the browser when the server call fails, and never throws', async () => {
    const sub = fakeSub()
    installPush({ permission: 'granted', sub })
    mockFetch(() => json({ error: 'x' }, 500))
    await expect(unsubscribeOnLogout('tok')).resolves.toBeUndefined()
    expect(sub.unsubscribe).toHaveBeenCalled()
  })

  it('is a no-op without push support or subscription', async () => {
    await expect(unsubscribeOnLogout('tok')).resolves.toBeUndefined()
    installPush({ permission: 'granted', sub: null })
    const f = mockFetch(...routes)
    await unsubscribeOnLogout('tok')
    expect(f).not.toHaveBeenCalled()
  })
})

describe('prefs and locale API', () => {
  it('reads and writes notification prefs', async () => {
    const f = mockFetch(
      (u, i) => (u.pathname === '/api/me/notification-prefs' && (i?.method ?? 'GET') === 'GET' ? json({ rideRequests: false, rideUpdates: true }) : undefined),
      (u, i) => (u.pathname === '/api/me/notification-prefs' && i?.method === 'PUT' ? noContent() : undefined)
    )
    expect(await getNotificationPrefs('t')).toEqual({ rideRequests: false, rideUpdates: true, reminders: true })
    await putNotificationPrefs('t', { rideRequests: true, rideUpdates: false, reminders: true })
    const put = f.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'PUT')!
    expect(JSON.parse((put[1] as RequestInit).body as string)).toEqual({ rideRequests: true, rideUpdates: false, reminders: true })
  })

  it('syncLocale PUTs the locale and swallows failures', async () => {
    const f = mockFetch(() => json({ error: 'x' }, 500))
    syncLocale('t', 'en')
    await vi.waitFor(() => expect(f).toHaveBeenCalled())
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)).toEqual({ locale: 'en' })
    expect(new URL(String(f.mock.calls[0][0]), 'http://x').pathname).toBe('/api/me/locale')
  })
})

describe('iOS install guide snooze', () => {
  it('shows on iOS Safari, and stays quiet for 7 days after dismissal', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    const now = Date.now()
    expect(shouldShowIosInstallGuide(now)).toBe(true)
    snoozeIosInstallGuide(now)
    expect(shouldShowIosInstallGuide(now + 1000)).toBe(false)
    expect(shouldShowIosInstallGuide(now + IOS_INSTALL_SNOOZE_MS + 1)).toBe(true)
    vi.restoreAllMocks()
  })
  it('never shows off iOS', () => {
    expect(shouldShowIosInstallGuide()).toBe(false)
  })
})
