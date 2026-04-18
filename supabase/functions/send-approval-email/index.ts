// Supabase Edge Function — שולח מייל כשמתאמן מאושר
// הגדרה: supabase secrets set RESEND_API_KEY=... APP_URL=https://teampact-app.vercel.app
// קריאה מה-UI אחרי approve:
//   await supabase.functions.invoke('send-approval-email', { body: { email, full_name } })

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { email, full_name } = await req.json()
    if (!email) return new Response(JSON.stringify({ error: 'missing email' }), { status: 400, headers: corsHeaders })

    const appUrl = Deno.env.get('APP_URL') || 'https://teampact-app.vercel.app'
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) return new Response(JSON.stringify({ error: 'RESEND_API_KEY not set' }), { status: 500, headers: corsHeaders })

    const html = `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#ecfdf5;border-radius:16px">
        <h1 style="color:#065f46">🥋 ברוך/ה הבא/ה ל-TeamPact!</h1>
        <p style="color:#374151;font-size:16px">שלום ${full_name || ''},</p>
        <p style="color:#374151;font-size:16px">בקשת ההצטרפות שלך אושרה ✅</p>
        <p style="color:#374151;font-size:16px">לחץ על הקישור כדי להיכנס לאפליקציה:</p>
        <p style="text-align:center;margin:24px 0">
          <a href="${appUrl}" style="background:#059669;color:#fff;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:bold;display:inline-block">פתח את האפליקציה</a>
        </p>
        <p style="color:#6b7280;font-size:13px">אם הכפתור לא עובד — ${appUrl}</p>
      </div>`

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'TeamPact <noreply@teampact-app.vercel.app>',
        to: [email],
        subject: '🥋 הבקשה שלך אושרה — ברוך/ה הבא/ה ל-TeamPact',
        html,
      }),
    })

    const data = await r.json()
    if (!r.ok) return new Response(JSON.stringify({ error: data }), { status: r.status, headers: corsHeaders })
    return new Response(JSON.stringify({ ok: true, data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
