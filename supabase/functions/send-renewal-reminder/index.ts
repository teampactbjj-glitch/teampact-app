// Supabase Edge Function — שולח מייל תזכורת חידוש מנוי בבת אחת לרשימת נמענים
// הגדרה: אותו RESEND_API_KEY שכבר מוגדר עבור send-approval-email
// קריאה מה-UI:
//   await supabase.functions.invoke('send-renewal-reminder', {
//     body: { recipients: [{ email, full_name }, ...] }
//   })
// מחזיר: { sent: number, failed: [{ email, error }] }
// נפרס ישירות ל-Supabase דרך MCP ב-15.09.2026 — קובץ זה הוא עותק תיעודי בריפו.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// הטקסט המדויק כפי שדודי ניסח — לא מנוסח מחדש.
const SUBJECT = 'חידוש מנוי — היכל הספורט בגין'
function buildHtml() {
  return `
    <div dir="rtl" style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#fff7ed;border-radius:16px">
      <p style="color:#374151;font-size:16px;margin:0 0 16px">שלום רב,</p>
      <p style="color:#374151;font-size:16px;margin:0 0 16px">
        אנו מעדכנים כי תוקף המנוי שלך לאימוני הלחימה במרכז ספורט בגין
        הסתיים ב-31/8.
      </p>
      <p style="color:#374151;font-size:16px;margin:0 0 16px">
        על מנת לחדש את המנוי ולהמשיך להתאמן איתנו יש להירשם מחדש בלינק המצורף:
      </p>
      <p style="text-align:center;margin:24px 0">
        <a href="https://forms.reh.co.il/begin/" style="background:#ea580c;color:#fff;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:bold;display:inline-block">
          לחידוש המנוי
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px;margin:0 0 16px">
        אם הכפתור לא עובד — https://forms.reh.co.il/begin/
      </p>
      <p style="color:#374151;font-size:16px;margin:0">
        תודה<br>צוות TEAMPACT<br>והיכל הספורט בגין
      </p>
    </div>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { recipients } = await req.json()
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return new Response(JSON.stringify({ error: 'missing recipients (non-empty array)' }), { status: 400, headers: corsHeaders })
    }
    // הגנת תקרה — לא לשלוח בטעות לרשימה ענקית בלי כוונה מפורשת
    if (recipients.length > 500) {
      return new Response(JSON.stringify({ error: 'too many recipients (max 500 per call)' }), { status: 400, headers: corsHeaders })
    }

    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) return new Response(JSON.stringify({ error: 'RESEND_API_KEY not set' }), { status: 500, headers: corsHeaders })

    const html = buildHtml()
    let sent = 0
    const failed: { email: string; error: string }[] = []

    for (const r of recipients) {
      const email = (r?.email || '').trim()
      if (!email) { failed.push({ email: '(ריק)', error: 'missing email' }); continue }
      try {
        const resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'TeamPact <noreply@teampact-app.vercel.app>',
            to: [email],
            subject: SUBJECT,
            html,
          }),
        })
        if (!resp.ok) {
          const t = await resp.text().catch(() => '')
          failed.push({ email, error: `resend ${resp.status}: ${t.slice(0, 200)}` })
        } else {
          sent++
        }
      } catch (e) {
        failed.push({ email, error: String(e?.message || e) })
      }
      // מרווח קטן בין שליחות כדי לא לפגוע ב-rate limit של Resend
      await new Promise((res) => setTimeout(res, 250))
    }

    return new Response(JSON.stringify({ sent, failed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: corsHeaders })
  }
})
