import { useEffect, useState } from 'react'
import { isIOS, isStandalone } from '../lib/platform'
import InstallGuideModal from './InstallGuideModal'

const DISMISS_KEY = 'tp-install-dismissed'
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000 // 14 days

function isDismissed() {
  try {
    const v = Number(localStorage.getItem(DISMISS_KEY) || 0)
    return v && (Date.now() - v) < DISMISS_MS
  } catch { return false }
}

export default function InstallBanner({ variant = 'card' }) {
  // variant 'hero' (מסך הרשמה) מתעלם מ-dismiss — זה ה-CTA הראשי, מוסתר רק אם כבר מותקן.
  const [hidden, setHidden] = useState(() => isStandalone() || (variant !== 'hero' && isDismissed()))
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [guideOpen, setGuideOpen] = useState(false)

  useEffect(() => {
    if (hidden) return
    function onBip(e) {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    function onInstalled() { setHidden(true) }
    window.addEventListener('beforeinstallprompt', onBip)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [hidden])

  if (hidden) return null

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
    setHidden(true)
  }

  async function install() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    try { await deferredPrompt.userChoice } catch {}
    setDeferredPrompt(null)
    setHidden(true)
  }

  const ios = isIOS() && !isStandalone()

  if (variant === 'slim') {
    return (
      <>
        <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-xs">
          <span>💡 הוסף את TeamPact למסך הבית כדי לקבל התראות</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="font-semibold text-blue-700 underline underline-offset-2 whitespace-nowrap"
            >
              איך?
            </button>
            {deferredPrompt && (
              <button type="button" onClick={install} className="font-semibold underline">
                התקן
              </button>
            )}
            <button type="button" onClick={dismiss} className="text-blue-700/70">✕</button>
          </div>
        </div>
        <InstallGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
      </>
    )
  }

  // variant 'hero' — שלט אדום בולט להתקנה, ל-CTA הראשי במסך ההרשמה
  if (variant === 'hero') {
    return (
      <>
        <InstallGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
        <div className="bg-gradient-to-br from-red-600 to-red-800 text-white rounded-2xl p-5 shadow-lg text-center">
          <div className="text-3xl mb-1" aria-hidden="true">📲</div>
          <h3 className="font-black text-lg">התקן את האפליקציה עכשיו</h3>
          <p className="text-sm text-red-100 mt-1">כדי שתהיה מוכן ברגע שהבקשה תאושר — ותקבל התראות על אימונים, הודעות וסמינרים.</p>
          {ios ? (
            <>
              <ol className="mt-3 space-y-1.5 text-sm text-red-50 list-decimal pr-5 text-right marker:text-red-200">
                <li>לחץ על כפתור השיתוף בסרגל התחתון של Safari</li>
                <li>גלול ובחר <b>"הוסף למסך הבית"</b></li>
                <li>פתח את TeamPact מהאייקון במסך הבית</li>
              </ol>
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="mt-3 inline-block bg-white text-red-700 font-bold py-2.5 px-5 rounded-xl text-sm hover:bg-red-50 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-white"
              >
                📖 הצג מדריך התקנה מפורט
              </button>
            </>
          ) : deferredPrompt ? (
            <button
              type="button"
              onClick={install}
              className="mt-3 w-full bg-white text-red-700 hover:bg-red-50 font-black py-3 rounded-xl text-base focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-white"
            >
              📥 התקן את האפליקציה
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="mt-3 w-full bg-white text-red-700 hover:bg-red-50 font-black py-3 rounded-xl text-base focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-white"
            >
              📥 איך מתקינים? הצג מדריך
            </button>
          )}
        </div>
      </>
    )
  }

  return (
    <>
    <InstallGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white rounded-2xl p-4 shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">📲</span>
          <h3 className="font-black text-sm">התקן את TeamPact במכשיר</h3>
        </div>
        <button type="button" onClick={dismiss} className="text-white/70 hover:text-white text-lg leading-none">✕</button>
      </div>
      <p className="text-xs text-blue-100 mt-2">כדי לקבל התראות על הודעות, שינויי לוז וחנות — גם כשהאפליקציה סגורה.</p>

      {ios ? (
        <>
          <ol className="mt-3 space-y-1.5 text-xs text-blue-50 list-decimal pr-5 marker:text-blue-200">
            <li>לחץ על כפתור השיתוף בסרגל התחתון של Safari
              <span className="inline-flex items-center align-middle mx-1 w-5 h-5 rounded bg-white/10 justify-center">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white" aria-hidden>
                  <path d="M12 3l4 4-1.4 1.4L13 6.8V16h-2V6.8L9.4 8.4 8 7l4-4zm-7 13h2v3h10v-3h2v5H5v-5z" />
                </svg>
              </span>
            </li>
            <li>גלול ובחר <b>"הוסף למסך הבית"</b></li>
            <li>פתח את TeamPact מהאייקון במסך הבית והפעל התראות</li>
          </ol>
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="mt-3 text-xs text-blue-200 underline underline-offset-2"
          >
            הצג מדריך מפורט →
          </button>
        </>
      ) : deferredPrompt ? (
        <button
          type="button"
          onClick={install}
          className="mt-3 w-full bg-white text-blue-700 hover:bg-blue-50 font-bold py-2 rounded-lg text-sm"
        >
          📥 התקן את האפליקציה
        </button>
      ) : (
        <>
          <p className="mt-3 text-xs text-blue-100">
            בדפדפן Chrome/Edge תראה הצעה להתקנה. אם אין — תפריט הדפדפן → "התקן אפליקציה".
          </p>
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="mt-2 text-xs text-blue-200 underline underline-offset-2"
          >
            הצג מדריך מפורט →
          </button>
        </>
      )}
    </div>
    </>
  )
}
