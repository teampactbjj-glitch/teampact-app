import { useEffect, useState } from 'react'
import { isPushSupported, requestPermissionAndSubscribe } from '../lib/push'
import { isIOS, isStandalone } from '../lib/platform'

const DISMISS_KEY = 'tp-push-dismissed'
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000

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
    <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-base">🔔</span>
        <span>הפעל התראות כדי לקבל עדכון בזמן אמת</span>
      </div>
      <div className="flex gap-2 items-center">
        <button
          type="button"
          disabled={busy}
          onClick={enable}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold px-3 py-1 rounded-lg"
        >
          {busy ? '...' : 'הפעל'}
        </button>
        <button type="button" onClick={dismiss} className="text-emerald-800/60 hover:text-emerald-900 text-base leading-none">✕</button>
      </div>
    </div>
  )
}
