// TeamPact service worker

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: event.data?.text?.() || 'TeamPact' } }
  const title = data.title || 'TeamPact'
  const options = {
    body: data.body || '',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    icon: data.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    dir: 'rtl',
    lang: 'he',
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification?.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of allClients) {
      try {
        await client.focus()
        client.postMessage({ type: 'navigate', url })
        return
      } catch {}
    }
    await self.clients.openWindow(url)
  })())
})

self.addEventListener('pushsubscriptionchange', () => {
  // client re-subscribes on next login via ensurePushSubscription
})
