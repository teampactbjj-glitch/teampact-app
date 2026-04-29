import { useEffect, useId, useRef } from 'react'

/**
 * Modal נגיש - תואם WCAG 2.1 AA
 * - role="dialog" + aria-modal
 * - focus trap עם החזרה למיקוד הקודם
 * - סגירה ב-ESC ובלחיצה על הרקע
 * - חוסם scroll של ה-body
 *
 * שימוש:
 * <Modal open={show} onClose={() => setShow(false)} title="כותרת" actions={<button>סגור</button>}>
 *   תוכן
 * </Modal>
 */
export default function Modal({ open, onClose, title, children, actions, maxWidth = 'max-w-md' }) {
  const dialogRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement
    // ממקד את המודל אחרי render
    const t = setTimeout(() => dialogRef.current?.focus(), 0)

    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
      }
      // focus trap בסיסי - שומר את ה-Tab בתוך המודל
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      // החזרת focus לאלמנט שהיה ממוקד לפני פתיחת המודל
      if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus()
      }
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
      dir="rtl"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`bg-white rounded-2xl ${maxWidth} w-full p-6 outline-none shadow-2xl max-h-[90vh] overflow-y-auto`}
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <h2 id={titleId} className="text-lg font-bold text-gray-800 mb-3">
            {title}
          </h2>
        )}
        <div className="text-sm text-gray-700 mb-4">{children}</div>
        {actions && <div className="flex gap-2 justify-end flex-wrap">{actions}</div>}
      </div>
    </div>
  )
}
