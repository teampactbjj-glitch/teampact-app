import { useContext } from 'react'
import { ToastContext } from './ToastContext'

/**
 * Hook לקבלת API של הודעות נגישות (החלפה ל-window.alert).
 *
 * שימוש:
 *   const toast = useToast()
 *   toast.success('נשמר!')
 *   toast.error('שגיאה')
 *   toast.info('מידע')
 *   toast.warning('אזהרה')
 */
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    return {
      show: (m) => window.alert(m),
      success: (m) => window.alert(m),
      error: (m) => window.alert(m),
      warning: (m) => window.alert(m),
      info: (m) => window.alert(m),
    }
  }
  return ctx
}
