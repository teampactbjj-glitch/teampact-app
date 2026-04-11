import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://pnicoluujpidguvniwub.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuaWNvbHV1anBpZGd1dm5pd3ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MTY2NjUsImV4cCI6MjA5MTI5MjY2NX0.I7bRbvy1eU-W3MrlHuB93v2nGffsA9oiapfaa3SX6nM'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'teampact-session',
    storage: window.localStorage,
  },
})
