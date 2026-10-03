// Pure push / notificationclick logic shared by src/sw.ts and its unit tests.
// Uses structural types only, so it compiles with either the DOM or the WebWorker lib.

export type PushKind = string

export const RENOTIFY_KINDS: ReadonlySet<PushKind> = new Set(['NEW_RIDE', 'ARRIVED', 'ETA_5MIN', 'MESSAGE'])
export const ICON = '/icons/icon-192.png'
export const BADGE = '/icons/badge-96.png'
export const DEFAULT_URL = '/app'

export type PushPayload = {
  title?: string
  body?: string
  url?: string
  tag?: string
  rideId?: number | string | null
  kind?: PushKind
}

export type NotificationData = { url: string; rideId: number | string | null; kind: PushKind | null }

export type ShowOptions = {
  body: string
  tag?: string
  data: NotificationData
  icon: string
  badge: string
  renotify: boolean
}

export type Registration = {
  showNotification(title: string, options: ShowOptions): Promise<void>
}

export type WindowClientLike = {
  url: string
  focus(): Promise<unknown>
  postMessage(message: unknown): void
}

export type ClientsLike = {
  matchAll(options: { type: 'window'; includeUncontrolled: boolean }): Promise<readonly WindowClientLike[]>
  openWindow(url: string): Promise<unknown>
}

/** Only in-app paths are honoured, so a payload can never send the user to another origin. */
export function safeUrl(url: unknown): string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : DEFAULT_URL
}

export function parsePayload(read: () => unknown): PushPayload {
  try {
    const v = read()
    return v && typeof v === 'object' ? (v as PushPayload) : {}
  } catch {
    return {}
  }
}

/** `renotify` needs a tag, otherwise the browser throws; drop it when there is no tag. */
export async function handlePush(registration: Registration, payload: PushPayload): Promise<void> {
  const kind = payload.kind ?? null
  const tag = payload.tag || undefined
  await registration.showNotification(payload.title || 'Farfartaxi', {
    body: payload.body ?? '',
    tag,
    data: { url: safeUrl(payload.url), rideId: payload.rideId ?? null, kind },
    icon: ICON,
    badge: BADGE,
    renotify: !!tag && kind !== null && RENOTIFY_KINDS.has(kind)
  })
}

export const NOTIFICATION_CLICK_MESSAGE = 'NOTIFICATION_CLICK'

/** Focus an existing app window and ask it to route to `url` client-side (no reload), else open a new one. */
export async function handleNotificationClick(
  clients: ClientsLike,
  data: Partial<NotificationData> | undefined,
  origin: string
): Promise<void> {
  const url = safeUrl(data?.url)
  const list = await clients.matchAll({ type: 'window', includeUncontrolled: true })
  const own = list.find((c) => c.url.startsWith(origin))
  if (own) {
    await own.focus()
    own.postMessage({ type: NOTIFICATION_CLICK_MESSAGE, url })
    return
  }
  await clients.openWindow(url)
}
