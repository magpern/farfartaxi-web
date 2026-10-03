import { describe, expect, it, vi } from 'vitest'
import {
  handleNotificationClick,
  handlePush,
  NOTIFICATION_CLICK_MESSAGE,
  parsePayload,
  safeUrl,
  type ClientsLike,
  type WindowClientLike
} from './handlers'

const ORIGIN = 'https://farfartaxi.pernemark.se'

function reg() {
  return { showNotification: vi.fn().mockResolvedValue(undefined) }
}

describe('handlePush', () => {
  it('shows the notification with tag, data, icons and renotify for NEW_RIDE', async () => {
    const r = reg()
    await handlePush(r, { title: 'Ny resa', body: 'Lisa 17:30', url: '/app/forare', tag: 'ride-7', rideId: 7, kind: 'NEW_RIDE' })
    expect(r.showNotification).toHaveBeenCalledWith('Ny resa', {
      body: 'Lisa 17:30',
      tag: 'ride-7',
      data: { url: '/app/forare', rideId: 7, kind: 'NEW_RIDE' },
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      renotify: true
    })
  })

  it.each(['NEW_RIDE', 'ARRIVED', 'ETA_5MIN', 'MESSAGE'])('renotifies for %s', async (kind) => {
    const r = reg()
    await handlePush(r, { title: 't', tag: 'ride-1', kind })
    expect(r.showNotification.mock.calls[0][1].renotify).toBe(true)
  })

  it.each(['ACCEPTED', 'EN_ROUTE', 'CANCELLED', 'REMINDER'])('does not renotify for %s', async (kind) => {
    const r = reg()
    await handlePush(r, { title: 't', tag: 'ride-1', kind })
    expect(r.showNotification.mock.calls[0][1].renotify).toBe(false)
  })

  it('never sets renotify without a tag (the browser would throw)', async () => {
    const r = reg()
    await handlePush(r, { title: 't', kind: 'ARRIVED' })
    expect(r.showNotification.mock.calls[0][1].renotify).toBe(false)
  })

  it('falls back to a safe default for empty or hostile payloads', async () => {
    const r = reg()
    await handlePush(r, { url: 'https://evil.example/x' })
    expect(r.showNotification).toHaveBeenCalledWith('Farfartaxi', expect.objectContaining({ body: '', data: { url: '/app', rideId: null, kind: null } }))
  })
})

describe('payload parsing', () => {
  it('returns {} when the push has no or invalid JSON', () => {
    expect(parsePayload(() => undefined)).toEqual({})
    expect(parsePayload(() => { throw new SyntaxError('bad') })).toEqual({})
    expect(parsePayload(() => ({ title: 'x' }))).toEqual({ title: 'x' })
  })
  it('only accepts in-app paths', () => {
    expect(safeUrl('/app/resa/1')).toBe('/app/resa/1')
    expect(safeUrl('//evil.example')).toBe('/app')
    expect(safeUrl('https://evil.example')).toBe('/app')
    expect(safeUrl(undefined)).toBe('/app')
  })
})

function client(url: string, extra: Partial<WindowClientLike> = {}): WindowClientLike & { focus: ReturnType<typeof vi.fn> } {
  return { url, focus: vi.fn().mockResolvedValue(undefined), postMessage: vi.fn(), ...extra } as never
}
function clientsOf(list: WindowClientLike[]) {
  return { matchAll: vi.fn().mockResolvedValue(list), openWindow: vi.fn().mockResolvedValue(null) } satisfies ClientsLike
}

describe('handleNotificationClick', () => {
  it('focuses an existing window and posts a client-side route message, never reloading', async () => {
    const c = client(`${ORIGIN}/app/resor`, { navigate: vi.fn() } as never)
    const clients = clientsOf([c])
    await handleNotificationClick(clients, { url: '/app/resa/7' }, ORIGIN)
    expect(c.focus).toHaveBeenCalled()
    expect(c.postMessage).toHaveBeenCalledWith({ type: NOTIFICATION_CLICK_MESSAGE, url: '/app/resa/7' })
    expect((c as never as { navigate: ReturnType<typeof vi.fn> }).navigate).not.toHaveBeenCalled()
    expect(clients.openWindow).not.toHaveBeenCalled()
  })

  it('opens a new window when no app window exists', async () => {
    const clients = clientsOf([client('https://other.example/')])
    await handleNotificationClick(clients, { url: '/app/forare/kor/3' }, ORIGIN)
    expect(clients.openWindow).toHaveBeenCalledWith('/app/forare/kor/3')
  })

  it('defaults to /app without data', async () => {
    const clients = clientsOf([])
    await handleNotificationClick(clients, undefined, ORIGIN)
    expect(clients.openWindow).toHaveBeenCalledWith('/app')
  })
})
