// TeamPact service worker
// Stage 1: install/activate only. Push listeners added in Stage 2.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
