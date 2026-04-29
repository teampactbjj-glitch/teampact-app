import { useState, useEffect, useRef } from 'react'

/**
 * AccessibilityWidget — כפתור צף עם תפריט הגדרות נגישות.
 * ההעדפות נשמרות ב-localStorage ומופעלות על תג <html> דרך classes.
 * ה-CSS עצמו ב-src/index.css.
 */

const PREFS_KEY = 'tp-a11y-prefs'

const DEFAULT_PREFS = {
  fontSize: 0,           // 0=רגיל, 1=גדול (+20%), 2=ענק (+40%)
  highContrast: false,
  noAnimations: false,
  emphasizedLinks: false,
  bigCursor: false,
}

function loadPrefs() {
  try {
    const stored = localStorage.getItem(PREFS_KEY)
    if (!stored) return { ...DEFAULT_PREFS }
    return { ...DEFAULT_PREFS, ...JSON.parse(stored) }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // localStorage עלול להיכשל בחלון פרטי — לא נורא, ההעדפות יישארו רק לסשן
  }
}

function applyPrefs(prefs) {
  const html = document.documentElement
  // הגדלת פונט
  html.classList.remove('a11y-text-large', 'a11y-text-xl')
  if (prefs.fontSize === 1) html.classList.add('a11y-text-large')
  else if (prefs.fontSize === 2) html.classList.add('a11y-text-xl')
  // שאר ההעדפות
  html.classList.toggle('a11y-high-contrast', !!prefs.highContrast)
  html.classList.toggle('a11y-no-animations', !!prefs.noAnimations)
  html.classList.toggle('a11y-emphasized-links', !!prefs.emphasizedLinks)
  html.classList.toggle('a11y-big-cursor', !!prefs.bigCursor)
}

// הפעלה מיידית בטעינת הקובץ — לפני שה-React mount.
// כך ההעדפות נכנסות לפני שהמשתמש רואה משהו, ואין הבזקה.
if (typeof document !== 'undefined') {
  applyPrefs(loadPrefs())
}

export default function AccessibilityWidget() {
  const [open, setOpen] = useState(false)
  const [prefs, setPrefs] = useState(loadPrefs)
  const panelRef = useRef(null)
  const buttonRef = useRef(null)

  // שמירה והחלה כשההעדפות משתנות
  useEffect(() => {
    applyPrefs(prefs)
    savePrefs(prefs)
  }, [prefs])

  // ESC לסגירה + focus trap בסיסי + החזרת focus לכפתור
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => panelRef.current?.focus(), 0)

    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
      // focus trap
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      // החזרת focus לכפתור הפתיחה כשסוגרים
      buttonRef.current?.focus()
    }
  }, [open])

  function update(key, value) {
    setPrefs(p => ({ ...p, [key]: value }))
  }

  function reset() {
    setPrefs({ ...DEFAULT_PREFS })
  }

  const cycleFontSize = () => update('fontSize', (prefs.fontSize + 1) % 3)

  return (
    <>
      {/* כפתור צף — נגיש בעצמו */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'סגור תפריט נגישות' : 'פתח תפריט נגישות'}
        aria-expanded={open}
        aria-controls="a11y-panel"
        className="fixed bottom-4 right-4 z-[9999] w-12 h-12 rounded-full bg-blue-700 hover:bg-blue-800 text-white text-2xl font-bold flex items-center justify-center shadow-2xl border-2 border-white focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-400 transition"
        style={{
          // לוודא שהכפתור לא מוסתר על-ידי safe-area-bottom של PWA במובייל
          marginBottom: 'env(safe-area-inset-bottom, 0)',
        }}
      >
        <span aria-hidden="true">♿</span>
      </button>

      {/* פאנל הגדרות */}
      {open && (
        <div
          ref={panelRef}
          id="a11y-panel"
          role="dialog"
          aria-modal="true"
          aria-label="הגדרות נגישות"
          tabIndex={-1}
          className="fixed bottom-20 right-4 z-[9999] w-72 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border-2 border-blue-700 p-4 outline-none"
          style={{
            marginBottom: 'env(safe-area-inset-bottom, 0)',
            maxHeight: 'calc(100vh - 6rem)',
            overflowY: 'auto',
          }}
        >
          <div className="flex items-center justify-between mb-3 pb-2 border-b">
            <h2 className="font-bold text-gray-800 text-base">
              <span aria-hidden="true">♿ </span>הגדרות נגישות
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="סגור תפריט נגישות"
              className="text-gray-400 hover:text-gray-600 text-xl leading-none w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-blue-500"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>

          <div className="space-y-2">
            {/* גודל טקסט */}
            <button
              type="button"
              onClick={cycleFontSize}
              aria-pressed={prefs.fontSize > 0}
              className="w-full text-right flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-blue-500 transition"
            >
              <span className="text-sm font-semibold text-gray-800">
                <span aria-hidden="true">🔠 </span>גודל טקסט
              </span>
              <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                {prefs.fontSize === 0 ? 'רגיל' : prefs.fontSize === 1 ? 'גדול +20%' : 'ענק +40%'}
              </span>
            </button>

            {/* ניגודיות גבוהה */}
            <button
              type="button"
              onClick={() => update('highContrast', !prefs.highContrast)}
              aria-pressed={prefs.highContrast}
              className={`w-full text-right flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border-2 transition focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-blue-500 ${
                prefs.highContrast
                  ? 'border-blue-700 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-500 hover:bg-blue-50'
              }`}
            >
              <span className="text-sm font-semibold text-gray-800">
                <span aria-hidden="true">🌓 </span>ניגודיות גבוהה
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${prefs.highContrast ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {prefs.highContrast ? 'מופעל' : 'כבוי'}
              </span>
            </button>

            {/* השהיית אנימציות */}
            <button
              type="button"
              onClick={() => update('noAnimations', !prefs.noAnimations)}
              aria-pressed={prefs.noAnimations}
              className={`w-full text-right flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border-2 transition focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-blue-500 ${
                prefs.noAnimations
                  ? 'border-blue-700 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-500 hover:bg-blue-50'
              }`}
            >
              <span className="text-sm font-semibold text-gray-800">
                <span aria-hidden="true">⏸ </span>עצור אנימציות
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${prefs.noAnimations ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {prefs.noAnimations ? 'מופעל' : 'כבוי'}
              </span>
            </button>

            {/* הדגשת קישורים */}
            <button
              type="button"
              onClick={() => update('emphasizedLinks', !prefs.emphasizedLinks)}
              aria-pressed={prefs.emphasizedLinks}
              className={`w-full text-right flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border-2 transition focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-blue-500 ${
                prefs.emphasizedLinks
                  ? 'border-blue-700 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-500 hover:bg-blue-50'
              }`}
            >
              <span className="text-sm font-semibold text-gray-800">
                <span aria-hidden="true">🔗 </span>הדגש קישורים ופוקוס
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${prefs.emphasizedLinks ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {prefs.emphasizedLinks ? 'מופעל' : 'כבוי'}
              </span>
            </button>

            {/* סמן גדול */}
            <button
              type="button"
              onClick={() => update('bigCursor', !prefs.bigCursor)}
              aria-pressed={prefs.bigCursor}
              className={`w-full text-right flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border-2 transition focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-blue-500 ${
                prefs.bigCursor
                  ? 'border-blue-700 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-500 hover:bg-blue-50'
              }`}
            >
              <span className="text-sm font-semibold text-gray-800">
                <span aria-hidden="true">🖱 </span>סמן גדול
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${prefs.bigCursor ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {prefs.bigCursor ? 'מופעל' : 'כבוי'}
              </span>
            </button>
          </div>

          <div className="mt-3 pt-3 border-t flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="flex-1 text-xs font-semibold text-gray-600 hover:text-red-700 hover:bg-red-50 py-2 rounded-lg border border-gray-300 hover:border-red-300 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-blue-500 transition"
            >
              איפוס הגדרות
            </button>
            <a
              href="/accessibility"
              className="flex-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 py-2 rounded-lg border border-blue-200 text-center focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-blue-500 transition"
            >
              הצהרת נגישות
            </a>
          </div>
        </div>
      )}
    </>
  )
}
