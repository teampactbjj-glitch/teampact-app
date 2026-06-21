// באנר "סביבת טסט" — מופיע רק כש-VITE_APP_ENV === 'staging'.
// בפרודקשן המשתנה לא מוגדר → הקומפוננטה מחזירה null ולא מציגה כלום.
// ממוקם ב-main.jsx מעל כל האפליקציה כדי שיופיע בכל הממשקים.
export default function StagingBanner() {
  if (import.meta.env.VITE_APP_ENV !== 'staging') return null

  return (
    <div
      aria-label="סביבת בדיקות"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 2147483647,
        pointerEvents: 'none',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          marginTop: 6,
          padding: '4px 14px',
          borderRadius: 9999,
          background: '#f59e0b',
          color: '#1a1a1a',
          fontWeight: 700,
          fontSize: 13,
          fontFamily: 'system-ui, sans-serif',
          boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
          border: '1px solid rgba(0,0,0,0.25)',
          whiteSpace: 'nowrap',
        }}
      >
        🟡 סביבת טסט — STAGING
      </div>
    </div>
  )
}
