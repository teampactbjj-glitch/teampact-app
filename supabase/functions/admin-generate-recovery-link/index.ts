// Supabase Edge Function — כלי מנהל: יצירת קישור איפוס סיסמה ישיר (בלי תלות במייל בכלל).
// נבנה ב-11.08.2026 כמענה קבוע לבעיית "מייל שחזור סיסמה לא מגיע" (SMTP/rate-limit/spam),
// שחזרה כמה פעמים ואי אפשר היה לאבחן אותה סופית מול לוגים (ראה MEMORY.md 10-11.08.2026).
//
// מה זה עושה: מנהל מחובר לוחץ כפתור ב-AthleteManagement.jsx → הפונקציה מייצרת קישור
// חד-פעמי מאובטח (auth.admin.generateLink, type: recovery) ומחזירה אותו ל-UI. שם המנהל
// מעתיק/שולח אותו ידנית בוואטסאפ למתאמן. המתאמן לוחץ, נכנס לאפליקציה מחובר, ומגדיר
// סיסמה חדשה בעצמו ב"הגדרות". אין כאן שום שליחה אוטומטית של מייל/הודעה — הפונקציה
// רק *מייצרת* את הקישור, השליחה בפועל היא פעולה ידנית של המנהל.
//
// ⚠️ אבטחה: generateLink עם ה-service_role key יכול ליצור קישור כניסה לכל משתמש לפי
// אימייל — לכן הפונקציה מוודאת קודם שהקורא (לפי ה-Authorization header שנשלח אוטומטית
// ע"י supabase-js מה-session הפעיל) הוא מנהל מאושר (profiles.is_admin = true AND
// profiles.is_approved = true), לפני שהיא מייצרת קישור לכל אימייל שהתבקש.
//
// הגדרת secrets (אם עוד לא מוגדרים מפונקציות קודמות — SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
// כבר קיימים אצלנו מ-green-invoice-webhook, ו-SUPABASE_ANON_KEY צריך להוסיף אם חסר):
//   supabase secrets set SUPABASE_ANON_KEY=...
//   supabase secrets set APP_URL=https://teampact-app.vercel.app
//
// קריאה מה-UI:
//   const { data, error } = await supabase.functions.invoke('admin-generate-recovery-link', {
//     body: { email: athlete.email },
//   })
//   // data.link — הקישור המוכן לשליחה

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { email } = await req.json()
    if (!email) {
      return new Response(JSON.stringify({ error: 'missing email' }), { status: 400, headers: corsHeaders })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const appUrl = Deno.env.get('APP_URL') || 'https://teampact-app.vercel.app'
    if (!supabaseUrl || !serviceKey || !anonKey) {
      return new Response(JSON.stringify({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY לא מוגדרים' }), { status: 500, headers: corsHeaders })
    }

    // 1) מי הקורא? (הטוקן של המשתמש המחובר, נשלח אוטומטית ע"י supabase.functions.invoke)
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) {
      return new Response(JSON.stringify({ error: 'לא מחובר — נדרש טוקן הזדהות' }), { status: 401, headers: corsHeaders })
    }
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: userData, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'טוקן לא תקין — התחבר מחדש ונסה שוב' }), { status: 401, headers: corsHeaders })
    }

    // 2) האם הוא מנהל מאושר? (בדיקה מול profiles עם service_role, לא סומכים על מה שהלקוח טוען)
    const admin = createClient(supabaseUrl, serviceKey)
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('is_admin, is_approved')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (profileErr || !profile?.is_admin || !profile?.is_approved) {
      return new Response(JSON.stringify({ error: 'הפעולה מותרת למנהלים מאושרים בלבד' }), { status: 403, headers: corsHeaders })
    }

    // 3) יצירת קישור השחזור בפועל
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: appUrl },
    })
    if (linkErr) {
      return new Response(JSON.stringify({ error: linkErr.message }), { status: 400, headers: corsHeaders })
    }

    // ✅ 11.08.2026 — משתמשים ב-hashed_token ובונים קישור לדומיין שלנו (לא action_link
    // הגולמי של Supabase), כדי לאמת בעצמנו בצד הלקוח דרך /reset-password (ר' ResetPasswordVerify.jsx).
    // אותו תיקון בדיוק שיושם לתבנית המייל, בעקבות הממצא ב-Resend Insights על מייל אמיתי
    // לאמיר בן דוד: קישור לדומיין שונה מהשולח מעורר חשד ספאם. כאן זה לא שולח מייל בכלל
    // (הקישור מועתק/נשלח ידנית בוואטסאפ ע"י המנהל), אבל אותה תבנית קישור עקבית ואמינה יותר.
    const hashedToken = linkData?.properties?.hashed_token
    if (!hashedToken) {
      return new Response(JSON.stringify({ error: 'לא התקבל קישור מ-Supabase — ייתכן שהאימייל לא קיים במערכת' }), { status: 500, headers: corsHeaders })
    }
    const link = `${appUrl}/reset-password?token_hash=${hashedToken}&type=recovery`

    return new Response(JSON.stringify({ ok: true, link }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
