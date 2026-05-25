import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

export function isPushSupported() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  } catch (e) {
    console.warn('SW register failed', e)
    return null
  }
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - base64.length % 4) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function toJson(sub) {
  const j = sub.toJSON ? sub.toJSON() : sub
  return {
    endpoint: j.endpoint,
    p256dh: j.keys?.p256dh,
    auth: j.keys?.auth,
  }
}

export async function ensurePushSubscription(user) {
  if (!user?.id) return null
  if (!isPushSupported()) return null
  if (!VAPID_PUBLIC_KEY) { console.warn('VITE_VAPID_PUBLIC_KEY not set'); return null }
  if (Notification.permission !== 'granted') return null

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()

  // If there's an existing sub but it was created with a different VAPID key
  // (e.g. keys were rotated), the push will fail with 403 "VAPID credentials do
  // not correspond". Detect and re-subscribe with the current key.
  if (sub) {
    const currentKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    const subKey = sub.options?.applicationServerKey
    const subKeyBytes = subKey ? new Uint8Array(subKey) : null
    const keysMatch = subKeyBytes && subKeyBytes.length === currentKey.length &&
      subKeyBytes.every((b, i) => b === currentKey[i])
    if (!keysMatch) {
      console.warn('push sub has stale VAPID key — re-subscribing')
      try {
        const oldEndpoint = sub.endpoint
        await sub.unsubscribe()
        if (oldEndpoint) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', oldEndpoint)
        }
      } catch (e) {
        console.warn('Failed to clean stale push subscription:', e)
      }
      sub = null
    }
  }

  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    } catch (e) {
      console.warn('pushManager.subscribe failed', e)
      return null
    }
  }
  const { endpoint, p256dh, auth } = toJson(sub)
  if (!endpoint || !p256dh || !auth) return null

  await supabase.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint,
    p256dh,
    auth,
    user_agent: navigator.userAgent,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })

  return sub
}

export async function requestPermissionAndSubscribe(user) {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' }
  let perm = Notification.permission
  if (perm === 'default') perm = await Notification.requestPermission()
  if (perm !== 'granted') return { ok: false, reason: 'denied' }
  const sub = await ensurePushSubscription(user)
  return { ok: !!sub, reason: sub ? 'ok' : 'failed' }
}

export function onPushNavigate(handler) {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return () => {}
  function listener(e) {
    if (e?.data?.type === 'navigate') handler(e.data.url || '/')
  }
  navigator.serviceWorker.addEventListener('message', listener)
  return () => navigator.serviceWorker.removeEventListener('message', listener)
}
