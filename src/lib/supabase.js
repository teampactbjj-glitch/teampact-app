import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://pnicoluujpidguvniwub.supabase.co'
const SUPABASE_KEY = 'sb_publishable_dlgsMcrgBrxR8G0w9hiqhw_RXAbxYmY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'teampact-session',
    storage: window.localStorage,
  },
})
