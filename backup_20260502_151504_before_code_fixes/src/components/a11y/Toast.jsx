import { useEffect } from 'react'

/**
 * Toast נגיש - תואם WCAG 4.1.3 (Status Messages)
 * - role="alert" עם aria-live="polite"
 * - היעלמות אוטומטית אחרי duration ms
 * - אפשרות סגירה ידנית
 *
 * שימוש:
 * const [toast, setToast] = useState(null)
 * <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
 * setToast({ message: 'נשמר!', type: 'success' })
 */
export default function Toast({ message, type = 'info', onClose, duration = 4000 }) {
  useEffect(() => {
    if (!message || !onClose || duration <= 0) return
    const t = setTimeout(onClose, duration)
    return () => clearTimeout(t)
  }, [message, onClose, duration])

  if (!message) return null

  const bg = type === 'error' ? 'bg-red-600'
    : type === 'success' ? 'bg-emerald-600'
    : type === 'warning' ? 'bg-amber-600'
    : 'bg-gray-800'

  return (
    <div
      role="alert"
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      dir="rtl"
      className={`fixed bottom-24 right-4 left-4 mx-auto max-w-sm ${bg} text-white rounded-lg px-4 py-3 shadow-lg z-[200] flex items-center justify-between gap-3`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <span className="text-sm font-medium">{message}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="סגור הודעה"
          className="text-white/80 hover:text-white text-lg leading-none px-1"
        >
          ✕
        </button>
      )}
    </div>
  )
}
