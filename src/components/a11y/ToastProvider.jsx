import { useCallback, useMemo, useState } from 'react'
import Toast from './Toast'
import { ToastContext } from './ToastContext'

/**
 * ToastProvider - החלפה נגישה ל-window.alert()
 * תואם WCAG 4.1.3 (Status Messages)
 *
 * עטוף את האפליקציה ב-<ToastProvider> ב-main.jsx, ובכל מקום השתמש ב-useToast() מ-useToast.js.
 */
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)

  const show = useCallback((message, type = 'info', duration = 4000) => {
    setToast({ message, type, duration, key: Date.now() })
  }, [])

  const api = useMemo(() => ({
    show,
    success: (msg, dur) => show(msg, 'success', dur),
    error: (msg, dur) => show(msg, 'error', dur ?? 6000),
    warning: (msg, dur) => show(msg, 'warning', dur),
    info: (msg, dur) => show(msg, 'info', dur),
  }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toast
        key={toast?.key}
        message={toast?.message}
        type={toast?.type}
        duration={toast?.duration}
        onClose={() => setToast(null)}
      />
    </ToastContext.Provider>
  )
}
