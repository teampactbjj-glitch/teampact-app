import { useEffect } from 'react'

// ── זיהוי סביבת הטסטים ──────────────────────────────────────────
// מציג באנר רק כשהכתובת היא של סביבת הטסטים (Vercel preview של branch staging),
// או כשהוגדר במפורש VITE_APP_ENV=staging.
// בפרודקשן (teampact-app.vercel.app / דומיין מותאם) — לעולם לא יופיע,
// כי אף אחד מהם לא מכיל "staging".
function isStagingEnv() {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return (
    host.includes('git-staging') ||
    host.includes('-staging') ||
    import.meta.env.VITE_APP_ENV === 'staging'
  )
}

export default function StagingBanner() {
  const show = isStagingEnv()

  // דוחף את תוכן הדף מעט כלפי מטה כדי שהבאנר לא יסתיר את ראש המסך
  useEffect(() => {
    if (!show) return
    const prev = document.body.style.paddingTop
    document.body.style.paddingTop = '32px'
    return () => { document.body.style.paddingTop = prev }
  }, [show])

  if (!show) return null

  return (
    <div
      role="status"
      aria-label="סביבת טסטים"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: '#f59e0b',
        color: '#1f2937',
        fontWeight: 700,
        fontSize: '13px',
        lineHeight: '16px',
        textAlign: 'center',
        padding: '8px 12px',
        direction: 'rtl',
        fontFamily: 'inherit',
        boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        userSelect: 'none',
      }}
    >
      🧪 סביבת טסטים — שינויים כאן לא מופיעים אצל המתאמנים
    </div>
  )
}
