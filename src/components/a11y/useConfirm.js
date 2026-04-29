import { useContext } from 'react'
import { ConfirmContext } from './ConfirmContext'

/**
 * Hook לקבלת פונקציית אישור נגישה (החלפה ל-window.confirm).
 *
 * שימוש:
 *   const confirm = useConfirm()
 *   const ok = await confirm({ title: 'למחוק?', message: 'הפעולה לא הפיכה', danger: true })
 *   if (!ok) return
 */
export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    // fallback אם אין Provider - מתנהג כמו confirm רגיל
    return ({ message }) => Promise.resolve(window.confirm(message || 'האם אתה בטוח?'))
  }
  return ctx
}
