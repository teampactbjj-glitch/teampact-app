import { createClient } from '@supabase/supabase-js'

// ── זיהוי סביבה ──────────────────────────────────────────────
// ברירת מחדל: production. בסביבת הטסטים נגדיר ב-Vercel: VITE_APP_ENV=staging
const APP_ENV = import.meta.env.VITE_APP_ENV || 'production'

// כתובת + מפתח ה-DB מגיעים מ-env (כל סביבה עם הערכים שלה ב-Vercel)
let SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
let SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// ── רשת ביטחון לפרודקשן בלבד ─────────────────────────────────
// אם חסרות הגדרות env: בפרודקשן ניפול ל-DB האמיתי (כמו היום).
// בכל סביבה אחרת (staging/preview) — אסור ליפול בטעות ל-DB הפרודקשן,
// לכן נעצור עם שגיאה ברורה במקום לגעת בנתוני המתאמנים האמיתיים.
const PROD_FALLBACK_URL = 'https://pnicoluujpidguvniwub.supabase.co'
const PROD_FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuaWNvbHV1anBpZGd1dm5pd3ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MTY2NjUsImV4cCI6MjA5MTI5MjY2NX0.I7bRbvy1eU-W3MrlHuB93v2nGffsA9oiapfaa3SX6nM'

if (!SUPABASE_URL || !SUPABASE_KEY) {
  if (APP_ENV === 'production') {
    SUPABASE_URL = SUPABASE_URL || PROD_FALLBACK_URL
    SUPABASE_KEY = SUPABASE_KEY || PROD_FALLBACK_KEY
  } else {
    throw new Error(
      `[TeamPact] סביבת "${APP_ENV}": חסרות הגדרות VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ` +
      `יש להגדיר אותן ב-Vercel עבור סביבה זו — כדי למנוע חיבור בטעות ל-DB הפרודקשן.`
    )
  }
}

// אזהרה ידידותית בקונסול כשרצים מול ה-DB של הפרודקשן בסביבת לא-פרודקשן
if (APP_ENV !== 'production' && SUPABASE_URL === PROD_FALLBACK_URL) {
  console.warn('[TeamPact] ⚠️ סביבת טסטים מחוברת ל-DB הפרודקשן! בדוק את הגדרות ה-env.')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'teampact-session',
    storage: window.localStorage,
  },
})
