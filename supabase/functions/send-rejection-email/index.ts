// Supabase Edge Function — שולח מייל כשבקשת הצטרפות של מתאמן נדחית
// הגדרה: אותו RESEND_API_KEY / APP_URL שכבר מוגדרים ל-send-approval-email
// (supabase secrets set RESEND_API_KEY=... APP_URL=https://teampact-app.vercel.app)
// קריאה מה-UI אחרי דחייה (AthleteManagement.jsx → rejectPending):
//   await supabase.functions.invoke('send-rejection-email', { body: { email, full_name } })

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { email, full_name, reason } = await req.json()
    if (!email) return new Response(JSON.stringify({ error: 'missing email' }), { status: 400, headers: corsHeaders })

    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) return new Response(JSON.stringify({ error: 'RESEND_API_KEY not set' }), { status: 500, headers: corsHeaders })

    const reasonBlock = reason
      ? `<div style="background:#fff;border:1px solid #fecaca;border-radius:10px;padding:12px 14px;margin:16px 0">
           <p style="color:#991b1b;font-size:14px;font-weight:bold;margin:0 0 4px">מה חסר / מה צריך לתקן:</p>
           <p style="color:#374151;font-size:15px;margin:0">${String(reason).slice(0, 500)}</p>
         </div>`
      : ''

    const html = `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#fef2f2;border-radius:16px">
        <h1 style="color:#991b1b">🥋 TeamPact — עדכון לגבי בקשת ההצטרפות</h1>
        <p style="color:#374151;font-size:16px">שלום ${full_name || ''},</p>
        <p style="color:#374151;font-size:16px">בקשת ההצטרפות שלך לא אושרה במערכת בשלב זה.</p>
        ${reasonBlock}
        <p style="color:#374151;font-size:16px">כדי להסדיר את הרישום ולקבל פרטים נוספים, נא לפנות/להגיע למזכירות או למנהל האקדמיה.</p>
        <p style="color:#6b7280;font-size:13px">אם יש לך שאלות — ניתן לחזור למייל זה.</p>
      </div>`

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'TeamPact <noreply@teampact-app.vercel.app>',
        to: [email],
        subject: '🥋 TeamPact — עדכון לגבי בקשת ההצטרפות שלך',
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
