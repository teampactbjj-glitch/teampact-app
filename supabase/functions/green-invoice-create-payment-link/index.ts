// Supabase Edge Function — יוצר לינק תשלום בחשבונית ירוקה (Green Invoice) עבור הרשמה
// למנוי חולון קאנטרי, או עבור אימון ניסיון.
//
// ✅ אומת ב-02.08.2026: /account/token עובד בפועל מול הסביבה האמיתית (production) של דודי —
// נבדק ישירות מול השרת (scripts/test-green-invoice-token.mjs), התקבל HTTP 200 + JWT אמיתי.
// לדודי אין חשבון Sandbox נפרד — המפתחות שלו הם production מההתחלה (ה-JWT מכיל "env":"prod").
//
// ⚠️ עדיין לא אומת בפועל: קריאת /payments/form עצמה (שדות הבקשה, ושם השדה בתשובה —
// url/link/משהו אחר). נבנתה לפי תיעוד ה-API הפומבי (https://greeninvoice.docs.apiary.io/)
// ולא נבדקה מול קריאה אמיתית. לפי כלל הברזל של הפרויקט (CLAUDE.md): אסור להניח שזה עובד
// כי זה "נראה הגיוני" — לפני הפעלה אמיתית מול לקוחות, יש לבדוק קריאה אחת אמיתית (למשל
// לינק תשלום ב-1 ש"ח) ולוודא שהתשובה אכן מכילה URL תקין. אם הקריאה נכשלת, יש לבדוק את
// גוף השגיאה שמוחזר (מודפס ל-console ומוחזר ב-response) ולהתאים.
//
// דרישה קודמת: תוכנית "Best" ומעלה + תוסף סליקה (Grow) מחובר בעסק TeamPact בחשבונית ירוקה.
//
// הגדרת secrets (חובה לפני הפעלה):
//   supabase secrets set GREEN_INVOICE_API_ID=...
//   supabase secrets set GREEN_INVOICE_API_SECRET=...
//   supabase secrets set GREEN_INVOICE_BASE_URL=https://api.greeninvoice.co.il/api/v1   (production — זה מה שדודי משתמש בו בפועל)
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...   (לעדכון trial_visits.green_invoice_doc_id וכו')
//
// קריאה מה-UI:
//   const { data, error } = await supabase.functions.invoke('green-invoice-create-payment-link', {
//     body: { type: 'trial' | 'subscription', reference_id, amount, description, customer_name, customer_phone }
//   })
//   // data.payment_url -> להפנות אליו את המשתמש

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getAccessToken(baseUrl: string, id: string, secret: string): Promise<string> {
  const r = await fetch(`${baseUrl}/account/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, secret }),
  })
  const data = await r.json()
  if (!r.ok || !data?.token) {
    throw new Error(`green-invoice token error: ${JSON.stringify(data)}`)
  }
  return data.token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { type, reference_id, amount, description, customer_name, customer_phone } = await req.json()

    if (!type || !['trial', 'subscription'].includes(type)) {
      return new Response(JSON.stringify({ error: 'type חייב להיות trial או subscription' }), { status: 400, headers: corsHeaders })
    }
    if (!reference_id || !amount || amount <= 0) {
      return new Response(JSON.stringify({ error: 'חסר reference_id או amount לא תקין' }), { status: 400, headers: corsHeaders })
    }

    const apiId = Deno.env.get('GREEN_INVOICE_API_ID')
    const apiSecret = Deno.env.get('GREEN_INVOICE_API_SECRET')
    const baseUrl = Deno.env.get('GREEN_INVOICE_BASE_URL') || 'https://api.greeninvoice.co.il/api/v1'

    if (!apiId || !apiSecret) {
      return new Response(JSON.stringify({
        error: 'GREEN_INVOICE_API_ID / GREEN_INVOICE_API_SECRET לא מוגדרים. יש להגדיר secrets בפרויקט Supabase לפני שאפשר ליצור לינקי תשלום אמיתיים.',
      }), { status: 500, headers: corsHeaders })
    }

    const token = await getAccessToken(baseUrl, apiId, apiSecret)

    // ⚠️ מבנה בקשה משוער — לאמת מול Sandbox. reference משמש כדי שה-webhook יוכל לשייך
    // את התשלום בחזרה ל-trial_visits / members (registration_payment_ref).
    const payload = {
      description: description || (type === 'trial' ? 'אימון ניסיון — TeamPact חולון קאנטרי' : 'הרשמה למנוי — TeamPact חולון קאנטרי'),
      amount,
      currency: 'ILS',
      client: { name: customer_name || '', phone: customer_phone || '' },
      reference: `${type}:${reference_id}`,
      successUrl: Deno.env.get('APP_URL') ? `${Deno.env.get('APP_URL')}/#payment-success` : undefined,
    }

    const r = await fetch(`${baseUrl}/payments/form`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await r.json()
    if (!r.ok) {
      console.error('green-invoice payments/form error:', data)
      return new Response(JSON.stringify({ error: 'שגיאה ביצירת לינק תשלום', details: data }), { status: r.status, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ payment_url: data.url || data.link, raw: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('green-invoice-create-payment-link error:', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
