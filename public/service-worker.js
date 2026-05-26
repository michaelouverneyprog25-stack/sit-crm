const CACHE_NAME = 'sit-lumx-v3'
const APP_SHELL = [
  '/offline.html',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/brand/sit-lumx-logo-transparent.png',
  '/brand/sit-lumx-symbol-transparent.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => caches.delete(key)),
    )),
  )
  self.clients.claim()
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET') return
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/assets/')) return
  if (request.mode !== 'navigate') return

  event.respondWith(
    fetch(request)
      .catch(() => caches.match(request)
        .then((cached) => cached || caches.match('/offline.html'))),
  )
})
