import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// בלי fallback לפרודקשן! אם חסרות הגדרות — עוצרים, כדי לא להתחבר בטעות ל-DB האמיתי.
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    'חסרות הגדרות Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). ' +
    'ודא שקיים קובץ ה-.env המתאים לסביבה (לוקאלי: .env.staging / .env.local; באוויר: משתני Vercel).'
  )
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'teampact-session',
    storage: window.localStorage,
  },
})
