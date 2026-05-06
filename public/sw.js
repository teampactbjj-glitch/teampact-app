// TeamPact service worker
// חשוב: לכל release חדש — יש לעדכן את המחרוזת למטה כדי להכריח את הדפדפן לזהות גרסה חדשה.
const SW_VERSION = '2026-05-03-welcome-back-overlay'
self.SW_VERSION = SW_VERSION

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// אפשרות לשלוח הודעה ידנית לדלג על waiting
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
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
    // ההתראה לא נעלמת אוטומטית אחרי 5 שניות — נשארת על המסך עד שהמתאמן
    // לוחץ עליה או מסיר אותה ידנית. קריטי כי לחיצה פותחת את ה-WelcomeBackOverlay
    // עם המסר המלא, ואם ההתראה ברחה — המתאמן יפספס.
    // ⚠️ iOS מתעלם מ-requireInteraction (מגבלת אפל) — שם ההתראה תיעלם אחרי ~5 שניות.
    // לכן יש fallback ב-UI: בפתיחת האפליקציה מופיעים באנרים שמציגים את אותו מסר.
    requireInteraction: true,
    // רטט: 200ms רטט, 100ms הפסקה, 200ms רטט. עוזר במכשירים ש"נשמטה" להם הקראה.
    vibrate: [200, 100, 200],
    silent: false,
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
