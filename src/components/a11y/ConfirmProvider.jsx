import { useCallback, useState } from 'react'
import Modal from './Modal'
import { ConfirmContext } from './ConfirmContext'

/**
 * ConfirmProvider - החלפה נגישה ל-window.confirm()
 * תואם WCAG 2.1.1, 2.4.3, 4.1.2
 *
 * עטוף את האפליקציה ב-<ConfirmProvider> ב-main.jsx, ובכל מקום שצריך אישור
 * השתמש ב-`useConfirm()` מהקובץ useConfirm.js.
 */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      setState({
        title: opts.title || 'אישור',
        message: opts.message || '',
        confirmLabel: opts.confirmLabel || 'אישור',
        cancelLabel: opts.cancelLabel || 'ביטול',
        danger: !!opts.danger,
        resolve,
      })
    })
  }, [])

  const handleClose = (result) => {
    state?.resolve?.(result)
    setState(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => handleClose(false)}
        title={state?.title}
        actions={
          <>
            <button
              type="button"
              onClick={() => handleClose(false)}
              className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-emerald-500"
            >
              {state?.cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => handleClose(true)}
              autoFocus
              className={`px-4 py-2 rounded-lg text-white font-semibold text-sm focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-emerald-300 ${
                state?.danger
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {state?.confirmLabel}
            </button>
          </>
        }
      >
        {state?.message}
      </Modal>
    </ConfirmContext.Provider>
  )
}
