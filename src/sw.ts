/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { handleNotificationClick, handlePush, parsePayload } from './sw/handlers'

declare const self: ServiceWorkerGlobalScope

// Precache only the build output; /api/ is never cached (no runtime caching routes at all).
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }))

// M2 prompt-update flow: the page asks the waiting worker to activate (registerSW(...)(true)).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') void self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  const payload = parsePayload(() => event.data?.json())
  event.waitUntil(handlePush(self.registration, payload))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(handleNotificationClick(self.clients, event.notification.data, self.location.origin))
})
