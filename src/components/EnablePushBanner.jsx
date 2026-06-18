import { useEffect, useState } from 'react'
import { isPushSupported, requestPermissionAndSubscribe } from '../lib/push'
import { isIOS, isStandalone } from '../lib/platform'

const DISMISS_KEY = 'tp-push-dismissed'
const DISMISS_MS = 2 * 24 * 60 * 60 * 1000 // 2 ימים — חוזר ומזכיר למי שלא הפעיל

function isDismissed() {
  try {
    const v = Number(localStorage.getItem(DISMISS_KEY) || 0)
    return v && (Date.now() - v) < DISMISS_MS
  } catch { return false }
}

export default function EnablePushBanner({ profile }) {
  const supported = isPushSupported()
  const ios = isIOS()
  const standalone = isStandalone()
  const needsInstall = ios && !standalone

  const [permission, setPermission] = useState(() => (supported ? Notification.permission : 'default'))
  const [hidden, setHidden] = useState(() => isDismissed())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supported) return
    const handler = () => setPermission(Notification.permission)
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [supported])

  if (!supported) return null
  if (hidden) return null
  if (permission === 'granted') return null
  if (needsInstall) return null // InstallBanner handles this case first

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
    setHidden(true)
  }

  async function enable() {
    setBusy(true)
    const { ok } = await requestPermissionAndSubscribe(profile)
    setBusy(false)
    setPermission(Notification.permission)
    if (!ok && Notification.permission === 'denied') dismiss()
  }

  return (
    <div
      role="region"
      aria-label="באנר הפעלת התראות"
      className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white rounded-2xl p-4 shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden="true">🔔</span>
          <h3 className="font-black text-sm">הפעל התראות</h3>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="סגור באנר"
          className="text-white/70 hover:text-white text-lg leading-none"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      <p className="text-xs text-emerald-50 mt-2">
        קבל עדכון מיידי על סמינרים, הודעות חדשות ושינויי לוז — גם כשהאפליקציה סגורה.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={enable}
        aria-label="הפעל התראות"
        className="mt-3 w-full bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 font-bold py-2 rounded-lg text-sm"
      >
        {busy ? '...' : '🔔 הפעל התראות'}
      </button>
    </div>
  )
}
